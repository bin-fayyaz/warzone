const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// --- DATABASE CONSTANTS ---
const DB_FILE = 'database.json'; 
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '{}');

const onlineStatus = {};

function getDB() {
    try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8') || '{}'); } 
    catch (e) { return {}; }
}
function saveDB(data) { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); }

// --- CONFIG ---
const GRAVITY = 0.025;
const JUMP_FORCE = 0.55;
const MAP_SIZE = 300;
const MAP_BOUNDS = MAP_SIZE / 2;
const WIN_SCORE = 20;

const WEAPONS = {
    'pistol':  { damage: 15, speed: 2.0, cooldown: 15, life: 40, type: 'secondary' },
    'ak47':    { damage: 25, speed: 2.5, cooldown: 8,  life: 60, type: 'primary' },
    'sniper':  { damage: 50, speed: 6.0, cooldown: 60, life: 120, type: 'primary' },
    'rpg':     { damage: 100, speed: 1.2, cooldown: 100, life: 100, type: 'primary', splash: 15 },
    'grenade': { damage: 100, speed: 0.9, cooldown: 100, life: 120, type: 'utility', splash: 20, gravity: 0.03 }
};

const games = {};

function generateRoomCode() { return Math.random().toString(36).substring(2, 6).toUpperCase(); }

io.on('connection', (socket) => {
    
    socket.on('register', (d) => {
        const db = getDB();
        if (db[d.username]) return socket.emit('authResponse', {success:false, msg:"User exists"});
        db[d.username] = { password: d.password, kills: 0, deaths: 0, friends: [], requests: [] };
        saveDB(db);
        socket.emit('authResponse', {success:true, msg:"Registered!"});
    });

    socket.on('login', (d) => {
        const db = getDB();
        const u = db[d.username];
        if (u && u.password === d.password) {
            socket.data.user = d.username;
            socket.data.isLogged = true;
            onlineStatus[d.username] = { status: 'Home', room: null };
            socket.emit('loginSuccess', { username: d.username, friends: getFriendData(u.friends), requests: u.requests });
        } else {
            socket.emit('authResponse', {success:false, msg:"Invalid credentials"});
        }
    });

    function getFriendData(friendList) {
        if(!friendList) return [];
        return friendList.map(name => {
            const s = onlineStatus[name] || { status: 'Offline', room: null };
            return { name: name, status: s.status, room: s.room };
        });
    }

    socket.on('sendFriendRequest', (target) => {
        if(!socket.data.isLogged) return;
        const sender = socket.data.user;
        const db = getDB();
        if(!db[target]) return socket.emit('sysMsg', "User not found");
        if(!db[target].requests) db[target].requests = [];
        if(db[target].requests.includes(sender) || db[target].friends.includes(sender)) return socket.emit('sysMsg', "Already sent/friends");
        db[target].requests.push(sender);
        saveDB(db);
        socket.emit('sysMsg', `Request sent to ${target}`);
    });

    socket.on('respondFriend', (d) => {
        if(!socket.data.isLogged) return;
        const me = socket.data.user;
        const db = getDB();
        if(!db[me]) return;
        db[me].requests = db[me].requests.filter(r => r !== d.target);
        if(d.action === 'accept') {
            if(!db[me].friends.includes(d.target)) db[me].friends.push(d.target);
            if(db[d.target] && !db[d.target].friends.includes(me)) db[d.target].friends.push(me);
        }
        saveDB(db);
        socket.emit('friendUpdate', { friends: getFriendData(db[me].friends), requests: db[me].requests });
    });

    socket.on('getStats', () => {
        if(!socket.data.isLogged) return;
        const db = getDB();
        const u = db[socket.data.user];
        if(u) socket.emit('statsData', { kills: u.kills, deaths: u.deaths });
    });

    socket.on('getFriendStats', (friendName) => {
        const db = getDB();
        if (db[friendName]) {
            const u = db[friendName];
            const ratio = u.deaths === 0 ? u.kills : (u.kills/u.deaths).toFixed(2);
            socket.emit('friendStatsData', { name: friendName, kills: u.kills, deaths: u.deaths, ratio });
        }
    });

    socket.on('quickPlay', (d) => {
        const keys = Object.keys(games);
        const room = keys.find(k => Object.keys(games[k].players).length < 10 && games[k].isActive);
        joinGame(socket, room || null, d, !room);
    });
    
    socket.on('hostGame', (d) => joinGame(socket, null, d, true));
    socket.on('joinGame', (d) => joinGame(socket, d.roomCode, d, false));

    function joinGame(socket, code, data, isHost) {
        let room = code ? code.toUpperCase() : generateRoomCode();
        if(!games[room]) {
            if(!isHost && code) return socket.emit('errorMsg', "Room not found");
            games[room] = { players: {}, bullets: [], pickups: [], mapObjects: generateMap(), scores: {'#3498db':0, '#e74c3c':0}, isActive: true };
            genPickups(room);
        }

        if(!games[room].isActive) return socket.emit('errorMsg', "Game Over.");

        let name = socket.data.isLogged ? socket.data.user : (data.username || "Guest");
        let final = name;
        let c = 1;
        while(Object.values(games[room].players).some(p => p.username === final)) final = `${name} (${c++})`;

        let team = data.teamColor;
        const pls = Object.values(games[room].players);
        const b = pls.filter(p=>p.teamColor==='#3498db').length;
        const r = pls.filter(p=>p.teamColor==='#e74c3c').length;
        if(team==='#3498db' && b > r) team='#e74c3c';
        else if(team==='#e74c3c' && r > b) team='#3498db';

        if(socket.data.isLogged) onlineStatus[socket.data.user] = { status: 'Playing', room: room };

        games[room].players[socket.id] = createPlayer(socket.id, final, team, data.gunType, data.hat, data.skin, socket.data.isLogged);
        socket.join(room);
        socket.data.roomCode = room;
        
        socket.emit('gameJoined', { roomCode: room, mapObjects: games[room].mapObjects, teamColor: team, username: final });
    }

    socket.on('switchWeapon', (slot) => {
        const r = socket.data.roomCode;
        if(games[r]?.players[socket.id]) {
            const p = games[r].players[socket.id];
            if(slot === 1) p.activeSlot = 'primary';
            if(slot === 2) p.activeSlot = 'secondary';
            if(slot === 3) p.activeSlot = 'utility';
        }
    });

    socket.on('playerInput', (inp) => {
        const r = socket.data.roomCode;
        if(!games[r]) return;
        const p = games[r].players[socket.id];
        if(!p || p.isDead) return;

        if(inp.grenade && p.grenadeCooldown <= 0 && p.grenades > 0) {
            p.grenades--;
            shoot(r, p, 'grenade', inp.rotation, -0.4);
            p.grenadeCooldown = 150;
        }
        if(p.grenadeCooldown > 0) p.grenadeCooldown--;

        const sin = Math.sin(inp.rotation), cos = Math.cos(inp.rotation);
        let dx=0, dz=0; const s = 0.4;
        if(inp.up) { dx -= sin*s; dz -= cos*s; }
        if(inp.down) { dx += sin*s; dz += cos*s; }
        if(inp.left) { dx -= cos*s; dz += sin*s; }
        if(inp.right) { dx += cos*s; dz -= sin*s; }

        if(Math.abs(p.x+dx)<MAP_BOUNDS && !checkColl(p.x+dx, p.y, p.z, games[r].mapObjects)) p.x += dx;
        if(Math.abs(p.z+dz)<MAP_BOUNDS && !checkColl(p.x, p.y, p.z+dz, games[r].mapObjects)) p.z += dz;

        if(inp.jump && p.grounded) { p.vy = JUMP_FORCE; p.grounded = false; }
        p.vy -= GRAVITY;
        let ny = p.y + p.vy;
        let fy = getFloor(p.x, ny, p.z, games[r].mapObjects);
        if(fy === null && ny < 0) fy = 0;

        if(fy !== null && ny <= fy) { p.y = fy; p.vy = 0; p.grounded = true; }
        else { p.y = ny; p.grounded = false; }

        p.rotation = inp.rotation;
        if(p.cooldown > 0) p.cooldown--;
    });

    socket.on('shoot', (d) => {
        const r = socket.data.roomCode;
        if(!games[r]) return;
        const p = games[r].players[socket.id];
        if(!p || p.isDead || p.cooldown > 0) return;

        let type = '', fire = false;
        if(p.activeSlot === 'primary' && p.ammoPrimary > 0) { type=p.primaryGun; p.ammoPrimary--; fire=true; }
        else if(p.activeSlot === 'secondary' && p.ammoSecondary > 0) { type='pistol'; p.ammoSecondary--; fire=true; }
        else if(p.activeSlot === 'utility') {
            if(p.grenades > 0) { type='grenade'; p.grenades--; fire=true; p.grenadeCooldown=150; }
        }

        if(fire) shoot(r, p, type, d.yaw, d.pitch);
    });

    socket.on('respawn', (d) => {
        const r = socket.data.roomCode;
        if(games[r]?.players[socket.id]) {
            const old = games[r].players[socket.id];
            if(old.isRegistered) updateStats(old.username, old.sessionKills, old.sessionDeaths);
            games[r].players[socket.id] = createPlayer(socket.id, old.username, old.teamColor, d.gunType, d.skin, old.isRegistered);
            games[r].players[socket.id].sessionKills = old.sessionKills;
            games[r].players[socket.id].sessionDeaths = old.sessionDeaths;
            games[r].players[socket.id].score = old.score;
        }
    });

    socket.on('chatMessage', (msg) => {
        const r = socket.data.roomCode;
        if(games[r]?.players[socket.id]) io.to(r).emit('chatUpdate', { user: games[r].players[socket.id].username, text: msg, team: games[r].players[socket.id].teamColor });
    });

    socket.on('disconnect', () => {
        const r = socket.data.roomCode;
        if(socket.data.isLogged) delete onlineStatus[socket.data.username]; 
        if(games[r]?.players[socket.id]) {
            const p = games[r].players[socket.id];
            if(p.isRegistered) updateStats(p.username, p.sessionKills, p.sessionDeaths);
            delete games[r].players[socket.id];
            io.to(r).emit('feedMsg', { msg: `${p.username} left.` });
        }
    });
});

// --- HELPER FUNCTIONS ---
function createPlayer(id, name, color, gun, skin, reg) {
    let sx, sz;
    do { sx = (Math.random()-0.5)*150; sz = (Math.random()-0.5)*150; } while(Math.abs(sx)<15 || Math.abs(sz)<15);
    return {
        id, username: name, teamColor: color, primaryGun: gun, activeSlot: 'primary',
        skin: skin || 'normal',
        x: sx, y: 5, z: sz, vy: 0, rotation: 0,
        health: 100, maxHealth: 100, ammoPrimary: 120, ammoSecondary: 60, grenades: 3,
        isDead: false, score: 0, cooldown: 0, grounded: false,
        sessionKills: 0, sessionDeaths: 0, isRegistered: reg
    };
}

function updateStats(user, k, d) {
    const db = getDB();
    if(db[user]) {
        db[user].kills = (db[user].kills||0) + k;
        db[user].deaths = (db[user].deaths||0) + d;
        saveDB(db);
    }
}

function checkWin(game, room) {
    if(!game.isActive) return;
    if(game.scores['#3498db'] >= WIN_SCORE || game.scores['#e74c3c'] >= WIN_SCORE) {
        game.isActive = false;
        const winner = game.scores['#3498db'] >= WIN_SCORE ? "BLUE TEAM" : "RED TEAM";
        const rankings = Object.values(game.players).map(p => ({
            name: p.username, kills: p.sessionKills, deaths: p.sessionDeaths
        })).sort((a,b) => b.kills - a.kills || a.deaths - b.deaths);
        io.to(room).emit('gameOver', { winner, rankings });
        Object.values(game.players).forEach(p => { if(p.isRegistered) updateStats(p.username, p.sessionKills, p.sessionDeaths); });
        setTimeout(() => delete games[room], 10000);
    }
}

function shoot(room, p, type, yaw, pitch) {
    const w = WEAPONS[type];
    p.cooldown = w.cooldown;
    const spawnY = p.y + 1.5;
    const vx = -Math.sin(yaw)*Math.cos(pitch)*w.speed;
    const vy = Math.sin(pitch)*w.speed;
    const vz = -Math.cos(yaw)*Math.cos(pitch)*w.speed;
    
    games[room].bullets.push({ 
        id:uuidv4(), ownerId:p.id, x:p.x, y:spawnY, z:p.z, 
        vx, vy, vz, type, life:w.life, damage:w.damage, splash:w.splash, gravity:w.gravity,
        speed: w.speed
    });
    io.to(room).emit('playSound', { type: type==='grenade'?'throw':'shoot' });
}

function generateMap() {
    const o = [];
    o.push({x:0, y:2.5, z:0, w:10, h:5, d:10});
    o.push({x:0, y:7.5, z:0, w:12, h:1, d:12});
    for(let i=0; i<60; i++) {
        const r = 20 + Math.random()*100;
        const a = Math.random() * Math.PI * 2;
        const w = 2+Math.random()*4, h=2+Math.random()*6, d=2+Math.random()*4;
        o.push({ x: Math.sin(a)*r, y: h/2, z: Math.cos(a)*r, w, h, d });
    }
    return o;
}

function checkColl(x, y, z, objs) {
    const r = 0.6;
    for(const o of objs) {
        if(x > o.x - o.w/2 - r && x < o.x + o.w/2 + r &&
           z > o.z - o.d/2 - r && z < o.z + o.d/2 + r &&
           y+0.5 < o.y + o.h/2 && y+1.5 > o.y - o.h/2) return true;
    }
    return false;
}

function getFloor(x, y, z, objs) {
    let hY = null;
    for(const o of objs) {
        if(x >= o.x - o.w/2 && x <= o.x + o.w/2 && z >= o.z - o.d/2 && z <= o.z + o.d/2) {
            const top = o.y + o.h/2;
            if(y >= top - 0.5) if(hY === null || top > hY) hY = top;
        }
    }
    return hY;
}

function genPickups(room) {
    for(let i=0; i<20; i++) {
        games[room].pickups.push({ id:uuidv4(), type: Math.random()>0.5?'ammo':(Math.random()>0.5?'health':'grenade'), x:(Math.random()-0.5)*250, z:(Math.random()-0.5)*250 });
    }
}

// --- FIX: DAMAGE RANGE FUNCTION ---
function explode(g, b, room) {
    io.to(room).emit('visualEffect', { type: 'explosion', x: b.x, y: b.y, z: b.z });
    io.to(room).emit('playSound', { type: 'explode' });
    const range = b.splash;
    
    Object.values(g.players).forEach(p => {
        if(!p.isDead) {
            const dist = Math.sqrt((p.x-b.x)**2 + (p.y-b.y)**2 + (p.z-b.z)**2);
            if(dist < range) {
                // FALLOFF LOGIC: 
                // Damage scales from Max (at center) to Min (at edge)
                // Using Formula: Dmg = Min + (Max - Min) * (1 - dist/range)
                // Range logic: 100 to 10
                
                const maxDmg = b.damage; 
                const minDmg = 10;
                
                let dmg = minDmg + (maxDmg - minDmg) * (1 - (dist / range));
                
                applyDmg(g, p, b.ownerId, Math.floor(dmg), room);
            }
        }
    });
}

function applyDmg(g, p, attId, dmg, room) {
    if(p.isDead || (g.players[attId] && g.players[attId].teamColor === p.teamColor && attId !== p.id)) return;
    p.health -= dmg;
    if(p.health <= 0) {
        p.health = 0; p.isDead = true;
        p.sessionDeaths++;
        const k = g.players[attId];
        if(k) {
            k.score++; k.sessionKills++;
            g.scores[k.teamColor]++;
            io.to(room).emit('killEvent', { killer: k.username, victim: p.username });
            checkWin(g, room);
        }
    }
}

setInterval(() => {
    Object.keys(games).forEach(room => {
        const g = games[room];
        if(!g.isActive) return;

        for(let i=g.bullets.length-1; i>=0; i--) {
            const b = g.bullets[i];
            const steps = Math.ceil(b.speed || 1); 
            const sVx = b.vx / steps, sVy = b.vy / steps, sVz = b.vz / steps;
            let hit = false;
            
            for(let s=0; s<steps; s++) {
                if(b.gravity) b.vy -= (b.gravity/steps);
                b.x += sVx; b.y += sVy; b.z += sVz;

                let fy = getFloor(b.x, b.y, b.z, g.mapObjects);
                if(fy === null && b.y < 0) fy = 0;

                if(fy !== null && b.y <= fy + 0.2) {
                    if(b.type === 'grenade') { b.y = fy + 0.2; b.vy *= -0.5; b.vx *= 0.7; b.vz *= 0.7; } 
                    else { hit = true; break; }
                } else if(checkColl(b.x, b.y, b.z, g.mapObjects)) { hit = true; break; }

                if(b.type !== 'grenade') {
                    for(const pid in g.players) {
                        const p = g.players[pid];
                        if(p.id !== b.ownerId && !p.isDead) {
                            if(Math.abs(p.x-b.x)<1 && Math.abs(p.z-b.z)<1 && b.y>p.y && b.y<p.y+2) {
                                applyDmg(g, p, b.ownerId, b.damage, room);
                                hit = true; 
                                if(b.splash) explode(g, b, room);
                                break;
                            }
                        }
                    }
                }
                if(hit) break;
            }

            b.life--;
            if(hit || (b.type==='grenade' && b.life<=0) || (b.type!=='grenade' && b.life<=0)) {
                if(b.splash && (hit || b.life<=0)) explode(g, b, room);
                if(b.type!=='grenade' || b.life<=0) g.bullets.splice(i, 1);
            }
        }

        Object.values(g.players).forEach(p => {
            if(p.isDead) return;
            for(let i=g.pickups.length-1; i>=0; i--) {
                const pk = g.pickups[i];
                if(Math.hypot(p.x-pk.x, p.z-pk.z) < 2 && Math.abs(p.y-0) < 2) {
                    let u = false;
                    if(pk.type==='health' && p.health<100) { p.health=Math.min(100, p.health+50); u=true; }
                    else if(pk.type==='ammo') { p.ammoPrimary+=50; p.ammoSecondary+=30; u=true; }
                    else if(pk.type==='grenade') { p.grenades+=1; u=true; }
                    if(u) {
                        g.pickups.splice(i,1);
                        setTimeout(() => { if(games[room]) games[room].pickups.push({ id:uuidv4(), type:pk.type, x:(Math.random()-0.5)*250, z:(Math.random()-0.5)*250 }); }, 10000);
                    }
                }
            }
        });
        io.to(room).emit('stateUpdate', g);
    });
}, 1000/60);

const PORT = 3000;
server.listen(PORT, () => console.log(`Server running on ${PORT}`));