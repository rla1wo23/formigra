const express = require("express");
const cors = require("cors");
const redis = require("redis");
const mysql = require("mysql2/promise");
require("dotenv").config();

const app = express();
const port = 3000;

// MySQL 연결 풀 설정
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

console.log("DB Host:", process.env.DB_HOST);
console.log("DB User:", process.env.DB_USER);
console.log("DB Password:", process.env.DB_PASSWORD);
console.log("DB Name:", process.env.DB_NAME);

// Redis 클라이언트 생성
const redisClient = redis.createClient({
  url: process.env.REDIS_URL,
});
redisClient.connect().catch(console.error);
app.use(cors());
app.use(express.json());

// 기본 경로, LB가 체크하는 경로
app.get("/", function (req, res) {
  res.send("Hello Load Balancer!");
});

// 서버 실행
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

// 영화 목록 API
app.get("/api/movies", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM Movies");
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error from getting movies");
  }
});

// 특정 영화의 상영회차 정보 API
app.get("/api/screens/:movieId", async (req, res) => {
  const { movieId } = req.params;
  try {
    const [rows] = await pool.query("SELECT * FROM Screens WHERE MovieID = ?", [
      movieId,
    ]);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error from getting screens for MovieID");
  }
});

// 특정 세션의 좌석 정보 API
app.get("/api/seats/:screenId", async (req, res) => {
  const { screenId } = req.params;
  try {
    // Redis에서 좌석 정보 조회
    let seats = await redisClient.get(`seats:${screenId}`);

    if (seats) {
      // Redis에서 좌석 정보가 있는 경우
      console.log(`Seats for screen ${screenId} found in Redis.`);
      return res.status(200).json(JSON.parse(seats));
    } else {
      // Redis에 좌석 정보가 없는 경우
      console.log(
        `Seats for screen ${screenId} not found in Redis. Fetching from RDS...`,
      );
      const [rows] = await pool.query(
        "SELECT SeatID, Status FROM Seats WHERE ScreenID = ?",
        [screenId],
      );

      if (rows.length === 0) {
        return res
          .status(404)
          .json({ error: "No seats found for this screen." });
      }

      // 좌석정보 캐싱
      await redisClient.set(`seats:${screenId}`, JSON.stringify(rows), {
        EX: 60 * 5, // 5분 TTL
      });

      console.log(`Seats for screen ${screenId} cached in Redis.`);
      return res.status(200).json(rows);
    }
  } catch (error) {
    console.error("Error fetching seat information:", error);
    res.status(500).send("Server error");
  }
});

// 좌석 예약 API
app.post("/api/seats/reserve", async (req, res) => {
  const { screenId, seatId } = req.body; // 요청 본문에서 screenId와 seatId 값을 가져옴
  try {
    //REDIS 좌석 조회
    let seatStatus = await redisClient.get(`seat:${screenId}:${seatId}`);

    if (seatStatus === null) {
      // Redis에 좌석 정보가 없으면 RDS에서 조회
      console.log(
        `Seat ${seatId} for screen ${screenId} not found in Redis. Fetching from RDS...`,
      );
      const [rows] = await pool.query(
        "SELECT Status FROM Seats WHERE ScreenID = ? AND SeatID = ?",
        [screenId, seatId],
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: "Seat not found" });
      }
      seatStatus = rows[0].Status;

      // 좌석 캐싱
      await redisClient.set(`seat:${screenId}:${seatId}`, seatStatus, {
        EX: 60 * 5, // 5분 TTL
      });

      console.log(`Seat ${seatId} for screen ${screenId} cached in Redis.`);
    }
    // 좌석 예약 여부 확인
    if (seatStatus === "reserved") {
      return res.status(400).json({ error: "Seat already reserved" });
    }

    // 동기화
    await redisClient.set(`seat:${screenId}:${seatId}`, "reserved"); // Redis
    await pool.query(
      'UPDATE Seats SET Status = "reserved" WHERE ScreenID = ? AND SeatID = ?',
      [screenId, seatId],
    );
    //RDS
    res.status(200).json({ message: "Seat reserved successfully" });
  } catch (error) {
    console.error("Error reserving seat:", error);
    res.status(500).json({ error: "Server error" });
  }
});
