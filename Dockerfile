# Node.js 이미지를 베이스로 설정
FROM node:latest

# 작업 디렉토리 설정
WORKDIR /usr/src/app

# 소스 코드를 이미지로 복사
COPY . .

# 패키지 설치
RUN npm install

# 앱 실행
CMD ["npm", "start"]

