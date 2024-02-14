const express = require('express');
const cors = require('cors');
const app = express();
const port = 3000;
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});
//RDS MySQL 데이터베이스 연결 설정
console.log("DB Host:", process.env.DB_HOST);
console.log("DB User:", process.env.DB_USER);
console.log("DB Password:", process.env.DB_PASSWORD);
console.log("DB Name:", process.env.DB_NAME);

app.get('/', function(req, res) {
  res.send('Hello World!');
});

// CORS 미들웨어 사용
app.use(cors());

// JSON 요청 본문을 파싱하기 위한 미들웨어
app.use(express.json());

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});


// 영화 목록 API
app.get('/api/movies', async (req, res) => {
    try {
        console.log("DB Name:", process.env.DB_NAME);
        const [rows] = await pool.query('SELECT * FROM Movies');
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).send('Server error from getting Movie');
    }
});

// 특정 영화의 상영회차 정보 API
app.get('/api/screens/:movieId', async (req, res) => {
    const { movieId } = req.params;
    try {
        const [rows] = await pool.query('SELECT * FROM Screens WHERE MovieID = ?', [movieId]);
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).send('Server error from getting screens for MovieID');
    }
});


// 특정 세션의 좌석 정보 API
app.get('/api/seats/:screenId', async (req, res) => {
    const { screenId } = req.params;
    try {
        const [rows] = await pool.query('SELECT * FROM Seats WHERE ScreenID = ?', [screenId]);
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).send('Server error from getting seats for ScreenID');
    }
});


// 좌석 예약
app.post('/api/seats/reserve', async (req, res) => {
    const { screenId, seatsId } = req.body; // 요청 본문에서 screenId, seatsId 값을 가져옵니다.
    try {
        const updateQuery = `
            UPDATE Seats
            SET Reservations = true
            WHERE ScreenID = ? AND SeatsID = ?;
        `;
        // DB 쿼리 실행
        const [result] = await pool.query(updateQuery, [screenId, seatsId]);

        if (result.affectedRows > 0) {
            res.send({ message: 'Seat reservation updated successfully.' });
        } else {
            res.status(404).send({ message: 'Seat not found or already reserved.' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Server error from seat reservation');
    }
});

