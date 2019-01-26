const express = require('express')
const sqlite3 = require('sqlite3').verbose()
const fs = require('fs')
const app = express()

const PORT = 3000
const DB_PATH = './users.db'
const SEG_NUM = 16
const SEG_MIN = 10
const SEG_MAX = 1000
const SEG_MULT = 100
const SEG_INTR = 1000

let segments = []

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Create segments of the wheel according to the parameters specified above
function generateSegments() {
    segments = []
    let i = 0;
    while (i < SEG_NUM) {
        seg = randInt(SEG_MIN, SEG_MAX) * SEG_MULT;
        let unique = true
        for (let j = 0; j < segments.length; j++) {
            if (seg <= segments[j] + SEG_INTR && seg >= segments[j] - SEG_INTR) {
                unique = false
                break
            }
        }
        if (unique) {
            segments.push(seg)
            i++
        }
    }
}

let db = {}
// If database file is present open it, otherwise create and then open it
if(fs.existsSync(DB_PATH)) {
    db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE, (err) => {
        if (err) { return console.log(err.message); }
        console.log('Connected to the users database');
    })
}
else {
    db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
        if (err) { return console.log(err.message); }
        console.log('Created and connected to the users database');
    })
    db.run('CREATE TABLE users(user TEXT PRIMARY_KEY, score INTEGER NOT NULL)', (err) => {
        console.log(err);
    });
}

// HTTP GET: user score; if user is not present in DB create a row for them with zero score
app.get('/score', (req, res) => {
    let user = req.query.user;
    let isUserNew = false
    db.get(`SELECT user, score FROM users WHERE user = ?`, [user], (err, row) => {
        if(err) { return console.log(err.message); }
        if(row) {
            if(req.header("Origin") != undefined)
                res.setHeader("Access-Control-Allow-Origin", req.header("Origin"));
            console.log(`User ${user} requested their score: ${row.score}`);
            res.send(row);
        }
        else
            isUserNew = true;
    })
    if(isUserNew) {
        db.run(`INSERT INTO users(user, score) VALUES(?,?)`, [user, 0], (err) => {
            if(err) { return console.log(err.message); }
        })
        if(req.header("Origin") != undefined)
            res.setHeader("Access-Control-Allow-Origin", req.header("Origin"));
            console.log(`User ${user} is a new user; adding them to the DB`);
        res.send({score: 0});
    }
})

// HTTP GET: segments; generate segments of the wheel
app.get('/segments', (req, res) => {
    generateSegments()
    if(req.header("Origin") != undefined)
        res.setHeader("Access-Control-Allow-Origin", req.header("Origin"));
    console.log(`Generated new segments: ${segments}`);
    res.send(segments);
})

// HTTP GET: spin; get a random segment of the wheel, add its value to user's score and respond with its index
app.get('/spin', (req, res) => {
    if(segments.length == 0) {
        res.send('Cannot spin when segments are not present; get segments first');
        return;
    }
    let segIndex = randInt(0,11);
    let segScore = segments[segIndex];
    let user = req.query.user;

    db.get(`SELECT user, score FROM users WHERE user = ?`, [user], (err, row) => {
        if(err) { return console.log(err.message); }
        let score = row.score + segScore;
        db.run(`UPDATE users SET score = ? WHERE user = ?`, [score, user], (err) => {
            if(err) { return console.log(err.message); }
        })
        if(req.header("Origin") != undefined)
            res.setHeader("Access-Control-Allow-Origin", req.header("Origin"));
        console.log(`User ${user} got segment #${segIndex} for ${segScore}`);
        res.send({index: segIndex});
    })
})

app.listen(PORT, () => console.log(`Wheel of fortune server listening on port ${PORT}`))

// Close the DB connection before exiting the app and when interrupting it from terminal
process.on('beforeExit', () => {
    console.log('Stopping server...');
    db.close();
    process.exit();
})
process.on('SIGINT', () => {
    console.log('Interrupting server...')
    db.close();
    process.exit();
})
