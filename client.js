window.onload = function() {
    const socket = io();
    
    // --- 1. DOM ELEMENTS ---
    const dom = {
        // Screens
        auth: document.getElementById('auth-screen'),
        login: document.getElementById('login-screen'),
        reg: document.getElementById('register-screen'),
        menu: document.getElementById('game-menu-screen'),
        cust: document.getElementById('cust-screen'),
        stats: document.getElementById('stats-screen'),
        pause: document.getElementById('pause-menu'),
        game: document.getElementById('ui-layer'),
        death: document.getElementById('death-screen'),
        end: document.getElementById('end-screen'),

        // Buttons
        btnGuest: document.getElementById('btn-play-guest'),
        btnLoginShow: document.getElementById('btn-show-login'),
        btnRegShow: document.getElementById('btn-show-register'),
        btnLogin: document.getElementById('btn-login'),
        btnBackAuth: document.getElementById('btn-back-auth'),
        btnReg: document.getElementById('btn-register'),
        btnBackReg: document.getElementById('btn-back-auth-reg'),
        btnAddFriend: document.getElementById('btn-add-friend'),
        btnShowStats: document.getElementById('btn-show-stats'),
        btnCloseStats: document.getElementById('btn-close-stats'), 
        btnLogout: document.getElementById('btn-logout'),
        btnQuick: document.getElementById('btn-quick'),
        btnHost: document.getElementById('btn-host'),
        btnJoin: document.getElementById('btn-join'),
        btnGo: document.getElementById('btn-go'),
        btnCust: document.getElementById('btn-cust'),
        btnSave: document.getElementById('btn-save'),
        btnResume: document.getElementById('btn-resume'),
        btnLeave: document.getElementById('btn-leave'),
        btnChangeGun: document.getElementById('btn-change-gun'),
        btnRespawn: document.getElementById('btn-respawn'),
        btnLeaveDeath: document.getElementById('btn-leave-death'),
        btnReturn: document.getElementById('btn-return-home'),

        // Inputs & Text
        authErr: document.getElementById('auth-error-msg'),
        loginErr: document.getElementById('login-error-msg'),
        regErr: document.getElementById('register-error-msg'),
        loginUser: document.getElementById('login-username'),
        loginPass: document.getElementById('login-password'),
        regUser: document.getElementById('register-username'),
        regPass: document.getElementById('register-password'),
        guestUserIn: document.getElementById('guest-username-input'),
        welcomeMsg: document.getElementById('welcome-msg'),
        friendInput: document.getElementById('add-friend-in'),
        roomCodeIn: document.getElementById('room-code-in'),
        chatIn: document.getElementById('chat-input'),

        // Lists/Containers
        friendPanel: document.getElementById('friend-panel'),
        friendList: document.getElementById('friend-list'),
        chatMsg: document.getElementById('chat-messages'),
        
        // HUD
        roomDisp: document.getElementById('room-display'),
        hp: document.getElementById('hp'),
        ammo: document.getElementById('ammo'),
        nades: document.getElementById('nades'),
        feed: document.getElementById('feed'),
        sBlue: document.getElementById('s-blue'),
        sRed: document.getElementById('s-red'),
        sb: document.getElementById('scoreboard'),
        sbBody: document.getElementById('sb-body'),
        crosshair: document.getElementById('crosshair'),
        
        chatUI: document.getElementById('chat-ui'),
        minimap: document.getElementById('minimap') ? document.getElementById('minimap').getContext('2d') : null,
        
        // Selects
        teamSelect: document.getElementById('team-select'),
        custGun: document.getElementById('cust-gun'),
        custSkin: document.getElementById('cust-skin'),
        deathGun: document.getElementById('death-gun-select'),

        // Profile Stats
        pName: document.getElementById('stats-username'),
        pKills: document.getElementById('stats-kills'),
        pDeaths: document.getElementById('stats-deaths'),
        pRatio: document.getElementById('stats-kd'),
        winnerText: document.getElementById('winner-text'),
        rankBody: document.getElementById('rank-body')
    };

    const slots = [document.getElementById('s1'), document.getElementById('s2'), document.getElementById('s3')];

    // --- STATE ---
    let myId = null, active = false, locked = false;
    let myGunPref = 'ak47', myTeam = '#3498db', mySkinPref = 'normal';
    let currentSlot = 1;
    let mouseDown = false, chatOpen = false;
    let mapObjects = [], mapSize = 300;
    
    let clientUser = 'Guest';
    let clientGuest = true;
    let myGunMesh = null; 

    const players={}, bullets={}, pickups={};
    const keys = {up:0, down:0, left:0, right:0, jump:0, grenade:0};
    const euler = new THREE.Euler(0,0,0,'YXZ');

    // --- AUDIO & TEXTURES ---
    const soundCtx = new (window.AudioContext || window.webkitAudioContext)();
    const sounds = {};
    let lastShootTime = 0;
    
    function loadSnd(name, url) { 
        fetch(url).then(r=>r.arrayBuffer()).then(b=>soundCtx.decodeAudioData(b, d=>sounds[name]=d)).catch(e=>{}); 
    }
    loadSnd('shoot', 'sounds/shoot.mp3'); 
    loadSnd('throw', 'sounds/grenade_fuse.mp3'); 
    loadSnd('explode', 'sounds/grenade_explode.mp3');
    
    function playSound(name) { 
        if(sounds[name]) { 
            const s=soundCtx.createBufferSource(); 
            s.buffer=sounds[name]; 
            s.connect(soundCtx.destination); 
            s.start(0); 
        } 
    }

    function getSkinMat(type, skinName) {
        let col = '#333';
        if(skinName==='gold') col='#FFD700';
        else if(skinName==='camo') col='#556B2F';
        else if(skinName==='neon') col='#00FFFF';
        return new THREE.MeshStandardMaterial({color:col});
    }

    function makeTex(col) {
        const c=document.createElement('canvas'); c.width=64; c.height=64; const x=c.getContext('2d');
        x.fillStyle=col; x.fillRect(0,0,64,64); x.strokeStyle='rgba(0,0,0,0.3)'; x.lineWidth=4; x.strokeRect(0,0,64,64);
        return new THREE.CanvasTexture(c);
    }
    const matWall=new THREE.MeshStandardMaterial({map:makeTex('#777')});
    const matGround=new THREE.MeshStandardMaterial({map:makeTex('#332')});
    
    function makePackTex(col, char) {
        const c=document.createElement('canvas'); c.width=64; c.height=64; const x=c.getContext('2d');
        x.fillStyle='#222'; x.fillRect(0,0,64,64); x.fillStyle=col; x.fillRect(5,5,54,54);
        x.fillStyle='#fff'; x.font='bold 40px Arial'; x.textAlign='center'; x.textBaseline='middle'; x.fillText(char,32,32);
        return new THREE.CanvasTexture(c);
    }
    const matPackHealth = new THREE.MeshBasicMaterial({map:makePackTex('#f00','+')});
    const matPackAmmo = new THREE.MeshBasicMaterial({map:makePackTex('#ff0','|')});
    const matPackNade = new THREE.MeshBasicMaterial({map:makePackTex('#0f0','o')});

    // --- THREE JS SETUP ---
    const scene = new THREE.Scene(); 
    scene.background = new THREE.Color(0x334455);
    
    // FIX: INCREASED FOG & CAMERA RANGE
    scene.fog = new THREE.Fog(0x334455, 50, 500); 

    const camera = new THREE.PerspectiveCamera(70, innerWidth/innerHeight, 0.1, 1000); 
    const renderer = new THREE.WebGLRenderer({antialias:true});
    renderer.setSize(innerWidth,innerHeight); 
    renderer.shadowMap.enabled = true;
    document.getElementById('game-container').appendChild(renderer.domElement);
    
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8); 
    sun.position.set(100,200,100); 
    sun.castShadow = true; 
    scene.add(sun);

    // --- HELPER FUNCTIONS ---
    function showScreen(screen) {
        [dom.auth,dom.login,dom.reg,dom.menu,dom.cust,dom.stats,dom.pause,dom.game,dom.death,dom.end].forEach(x=>{if(x)x.classList.add('hidden')});
        if(screen) screen.classList.remove('hidden'); 
    }
    showScreen(dom.auth);
    
    function bind(el, fn) { if(el) el.onclick = fn; }

    // --- LISTENERS ---
    bind(dom.btnGuest, () => {
        clientGuest=true; clientUser='Guest';
        if(dom.guestUserIn) dom.guestUserIn.style.display='block'; 
        if(dom.friendPanel) dom.friendPanel.style.display='none';
        if(dom.welcomeMsg) dom.welcomeMsg.innerText="Welcome, Guest";
        if(dom.btnLogout) dom.btnLogout.style.display='none';
        if(dom.btnShowStats) dom.btnShowStats.style.display='none';
        showScreen(dom.menu);
    });
    
    bind(dom.btnLoginShow, ()=>showScreen(dom.login));
    bind(dom.btnRegShow, ()=>showScreen(dom.reg));
    bind(dom.btnBackAuth, ()=>showScreen(dom.auth));
    bind(dom.btnBackReg, ()=>showScreen(dom.auth));
    
    bind(dom.btnLogin, ()=>socket.emit('login',{username:dom.loginUser.value, password:dom.loginPass.value}));
    bind(dom.btnReg, ()=>socket.emit('register',{username:dom.regUser.value, password:dom.regPass.value}));

    bind(dom.btnAddFriend, ()=>{ const n=dom.friendInput.value; if(n) socket.emit('sendFriendRequest',n); dom.friendInput.value=''; });
    bind(dom.btnShowStats, ()=>{socket.emit('getStats'); showScreen(dom.stats);});
    bind(dom.btnCloseStats, ()=>showScreen(dom.menu));
    bind(dom.btnLogout, ()=>location.reload());

    bind(dom.btnQuick, ()=>join({quick:true}));
    bind(dom.btnHost, ()=>join({quick:false}));
    bind(dom.btnJoin, ()=>document.getElementById('join-area').style.display='block');
    bind(dom.btnGo, ()=>join({code:dom.roomCodeIn.value}));
    bind(dom.btnCust, ()=>showScreen(dom.cust));
    bind(dom.btnSave, ()=>{ myGunPref=dom.custGun.value; mySkinPref=dom.custSkin.value; showScreen(dom.menu); });

    bind(dom.btnResume, ()=>{ dom.pause.classList.add('hidden'); document.body.requestPointerLock(); });
    bind(dom.btnLeave, ()=>location.reload());
    bind(dom.btnLeaveDeath, ()=>location.reload());
    bind(dom.btnChangeGun, ()=>{ 
        myGunPref=prompt("Gun?",myGunPref)||myGunPref; 
        socket.emit('respawn',{gunType:myGunPref}); document.body.requestPointerLock(); dom.pause.classList.add('hidden'); 
    });
    bind(dom.btnRespawn, ()=>{ 
        myGunPref=dom.deathGun.value; socket.emit('respawn',{gunType:myGunPref, skin:mySkinPref}); document.body.requestPointerLock(); 
    });
    bind(dom.btnReturn, ()=>location.reload());

    // --- SOCKET EVENTS ---
    socket.on('authResponse', d=>{
        if(d.success) showScreen(dom.login);
        else { dom.authErr.innerText=d.msg; dom.loginErr.innerText=d.msg; dom.regErr.innerText=d.msg; }
    });
    
    socket.on('loginSuccess', d=>{
        clientGuest=false; clientUser=d.username;
        dom.guestUserIn.style.display='none'; dom.friendPanel.style.display='block';
        dom.btnShowStats.style.display='inline-block'; dom.btnLogout.style.display='inline-block';
        dom.welcomeMsg.innerText=`Welcome ${d.username}`;
        updateFriendUI(d.friends, d.requests);
        showScreen(dom.menu);
    });

    socket.on('sysMsg', m=>alert(m));
    socket.on('friendUpdate', d=>updateFriendUI(d.friends, d.requests));
    
    function updateFriendUI(friends, reqs) {
        if(!dom.friendList) return;
        dom.friendList.innerHTML='';
        reqs.forEach(r=>{
            const d=document.createElement('div'); d.className='friend-item';
            d.innerHTML=`<span style="color:gold;">Req: ${r}</span><div><button class="btn-sm" style="background:#2ecc71" onclick="respF('${r}','accept')">Y</button><button class="btn-sm" style="background:#e74c3c" onclick="respF('${r}','reject')">N</button></div>`;
            dom.friendList.appendChild(d);
        });
        friends.forEach(f=>{
            const d=document.createElement('div'); d.className='friend-item';
            d.innerHTML=`<span>${f.name} <small style="color:${f.status==='Playing'?'#0f0':'#aaa'}">${f.status}</small></span> <button class="btn-sm" style="background:#444" onclick="statF('${f.name}')">Stat</button>`;
            dom.friendList.appendChild(d);
        });
    }

    window.respF=(n,a)=>socket.emit('respondFriend',{target:n, action:a});
    window.statF=(n)=>{socket.emit('getFriendStats',n); showScreen(dom.stats);};
    window.addF=(n)=>socket.emit('sendFriendRequest',n);

    socket.on('friendStatsData', d=>{
        dom.pName.innerText=d.name; dom.pKills.innerText=d.kills; dom.pDeaths.innerText=d.deaths; dom.pRatio.innerText=d.ratio;
    });
    socket.on('statsData', d=>{
        dom.pName.innerText=clientUser; dom.pKills.innerText=d.kills; dom.pDeaths.innerText=d.deaths; dom.pRatio.innerText=d.ratio;
    });

    function join(d){ 
        const u = clientGuest ? (dom.guestUserIn ? dom.guestUserIn.value : 'Guest') : clientUser;
        socket.emit(d.quick?'quickPlay':'joinGame', {
            username: u, teamColor: dom.teamSelect.value,
            gunType: myGunPref, skin:mySkinPref, roomCode:d.code
        });
    }

    // --- GAME ---
    socket.on('gameJoined', d=>{
        showScreen(dom.game); 
        dom.crosshair.style.display='block';
        dom.roomDisp.innerText=`CODE: ${d.roomCode}`;
        myTeam=d.teamColor; mapObjects=d.mapObjects;
        renderMap(d.mapObjects); active=true;
        createLocalGun();
        document.body.requestPointerLock();
    });
    
    socket.on('gameOver', d=>{
        active=false; document.exitPointerLock();
        showScreen(dom.end);
        dom.winnerText.innerText = `${d.winner} WINS!`;
        dom.rankBody.innerHTML='';
        d.rankings.forEach((p,i)=>{
            dom.rankBody.innerHTML += `<tr><td>${i+1}</td><td>${p.name}</td><td>${p.kills}</td><td>${p.deaths}</td></tr>`;
        });
    });

    function createLocalGun() {
        if(myGunMesh) camera.remove(myGunMesh);
        const g = new THREE.Group();
        const mat = getSkinMat(null, mySkinPref);
        
        if(currentSlot===1) { // Primary
            if(myGunPref === 'rpg') {
                const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.12,1.4,16), mat); tube.rotation.x=Math.PI/2;
                const head = new THREE.Mesh(new THREE.ConeGeometry(0.15,0.4,16), new THREE.MeshStandardMaterial({color:'#500'})); head.rotation.x=-Math.PI/2; head.position.z=-0.8;
                g.add(tube,head); g.position.set(0.4,-0.3,-0.5);
            } else if(myGunPref === 'sniper') {
                const b = new THREE.Mesh(new THREE.BoxGeometry(0.1,0.15,1.8), mat);
                const s = new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,0.3), new THREE.MeshStandardMaterial({color:'#000'})); s.rotation.x=Math.PI/2; s.position.y=0.12;
                g.add(b,s); g.position.set(0.3,-0.3,-0.7);
            } else { // AK47
                const b = new THREE.Mesh(new THREE.BoxGeometry(0.1,0.2,1.0), mat);
                const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.6), new THREE.MeshStandardMaterial({color:'#555'})); bar.rotation.x=Math.PI/2; bar.position.z=-0.6;
                g.add(b,bar); g.position.set(0.3,-0.3,-0.6);
            }
        } else if(currentSlot===2) { // Pistol
            g.add(new THREE.Mesh(new THREE.BoxGeometry(0.08,0.1,0.4), new THREE.MeshStandardMaterial({color:'#777'}))); g.position.set(0.2,-0.3,-0.4);
        } else { // Grenade
            g.add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.12), new THREE.MeshStandardMaterial({color:'#27ae60'}))); g.position.set(0.2,-0.3,-0.4);
        }
        myGunMesh=g; camera.add(g); scene.add(camera);
    }

    function createPlayerMesh(p) {
        const g=new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({color: p.teamColor});
        const b=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.5,1.8), mat); b.position.y=0.9;
        const h=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.5,0.5), new THREE.MeshStandardMaterial({color:0x222})); h.position.y=2.0;
        
        const gunMat = getSkinMat(null, p.skin);
        let gunGeo = p.primaryGun==='rpg' ? new THREE.CylinderGeometry(0.1,0.1,1.2) : new THREE.BoxGeometry(0.1,0.2,0.8);
        const gun=new THREE.Mesh(gunGeo, gunMat);
        if(p.primaryGun==='rpg') gun.rotation.x = Math.PI/2;
        gun.position.set(0.3,1.3,0.3);
        
        g.add(b,h,gun); return g;
    }

    function renderMap(objs) {
        const fl=new THREE.Mesh(new THREE.PlaneGeometry(300,300),matGround); fl.rotation.x=-Math.PI/2; fl.receiveShadow=true; scene.add(fl);
        const geo=new THREE.BoxGeometry(1,1,1);
        if(objs) objs.forEach(o=>{ const m=new THREE.Mesh(geo,matWall); m.position.set(o.x,o.y,o.z); m.scale.set(o.w,o.h,o.d); m.castShadow=true; m.receiveShadow=true; scene.add(m); });
    }

    socket.on('stateUpdate', g=>{
        if(!active) return;
        if(dom.sBlue) dom.sBlue.innerText=g.scores['#3498db']; 
        if(dom.sRed) dom.sRed.innerText=g.scores['#e74c3c'];

        const ids=Object.keys(g.players);
        Object.keys(players).forEach(id=>{if(!ids.includes(id)){scene.remove(players[id].mesh); delete players[id];}});

        ids.forEach(id=>{
            const p=g.players[id];
            if(id===socket.id) {
                myId=id;
                if(dom.hp) dom.hp.innerText=Math.floor(p.health); 
                if(dom.nades) dom.nades.innerText=p.grenades;
                if(dom.ammo) dom.ammo.innerText=p.activeSlot==='primary'?p.ammoPrimary:(p.activeSlot==='secondary'?p.ammoSecondary:'-');
                
                if(p.isDead) { 
                    if(dom.death) dom.death.classList.remove('hidden'); 
                    document.exitPointerLock(); 
                } else { 
                    if(dom.death) dom.death.classList.add('hidden'); 
                    camera.position.lerp(new THREE.Vector3(p.x, p.y+1.6, p.z), 0.5); 
                }
                
                if(dom.minimap) drawMinimap(p.x, p.z, g.players, g.pickups);
                if(!players[id]) players[id]={}; players[id].data=p;
                return;
            }
            if(!players[id]) { const m=createPlayerMesh(p); scene.add(m); players[id]={mesh:m}; }
            players[id].data=p; const m=players[id].mesh;
            m.visible = !p.isDead && p.invisibleTime<=0;
            m.position.lerp(new THREE.Vector3(p.x,p.y,p.z), 0.3); m.rotation.y=p.rotation;
        });

        Object.keys(bullets).forEach(k=>scene.remove(bullets[k])); for(let k in bullets) delete bullets[k];
        g.bullets.forEach(b=>{
            let m;
            if (b.type === 'rpg') {
                const grp = new THREE.Group();
                const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.6), new THREE.MeshBasicMaterial({color:'#555'})); body.rotation.x = Math.PI / 2;
                const head = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.2), new THREE.MeshBasicMaterial({color:'#f00'})); head.rotation.x = -Math.PI / 2; head.position.z = 0.4;
                grp.add(body, head); m = grp; m.lookAt(b.x + b.vx, b.y + b.vy, b.z + b.vz);
            } else {
                const c=b.type==='grenade'?0x00ff00:0xffff00; const s=b.type==='grenade'?0.3:0.15;
                m=new THREE.Mesh(new THREE.SphereGeometry(s), new THREE.MeshBasicMaterial({color:c}));
            }
            m.position.set(b.x,b.y,b.z); scene.add(m); bullets[b.id]=m;
        });

        Object.keys(pickups).forEach(k=>{if(!g.pickups.find(x=>x.id===k)){scene.remove(pickups[k]); delete pickups[k];}});
        g.pickups.forEach(pk=>{
            if(!pickups[pk.id]){
                let mat = matPackAmmo;
                if(pk.type==='health') mat = matPackHealth;
                if(pk.type==='grenade') mat = matPackNade;
                
                const m=new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), mat);
                m.position.set(pk.x,0.6,pk.z); scene.add(m); pickups[pk.id]=m;
            }
            pickups[pk.id].rotation.y+=0.05;
        });
    });

    socket.on('chatUpdate', d=>{
        const div=document.createElement('div'); div.className='chat-msg';
        div.innerHTML=`<span class="${d.team==='#3498db'?'chat-blue':'chat-red'}">[${d.user}]</span>: ${d.text}`;
        dom.chatMsg.appendChild(div); dom.chatMsg.scrollTop=dom.chatMsg.scrollHeight;
    });

    socket.on('feedMsg', d=>addFeed(d.msg,'#fff'));
    socket.on('killEvent', d=>addFeed(`${d.killer} killed ${d.victim}`,'#f55'));
    function addFeed(t,c){ 
        if(!dom.feed) return;
        const d=document.createElement('div'); d.className='feed-item'; d.style.color=c; d.innerText=t; 
        dom.feed.prepend(d); setTimeout(()=>d.remove(),4000); 
    }
    socket.on('playSound', d=>playSound(d.type));
    socket.on('visualEffect', d=>{ const m=new THREE.Mesh(new THREE.SphereGeometry(3), new THREE.MeshBasicMaterial({color:0xffaa00,wireframe:true})); m.position.set(d.x,d.y,d.z); scene.add(m); setTimeout(()=>scene.remove(m),200); });

    function drawMinimap(px, pz, allP, pick) {
        if(!dom.minimap) return;
        const ctx=dom.minimap; ctx.clearRect(0,0,160,160); ctx.fillStyle='#222'; ctx.fillRect(0,0,160,160);
        const scale=160/300; const off=80;
        ctx.fillStyle='#555'; mapObjects.forEach(o=>ctx.fillRect((o.x*scale)+off-o.w*scale/2, (o.z*scale)+off-o.d*scale/2, o.w*scale, o.d*scale));
        pick.forEach(p=>{ ctx.fillStyle=p.type==='health'?'#f00':(p.type==='ammo'?'#ff0':'#0f0'); ctx.beginPath(); ctx.arc((p.x*scale)+off,(p.z*scale)+off,2,0,6); ctx.fill(); });
        Object.values(allP).forEach(p=>{
            if(p.id!==myId && p.teamColor===myTeam) { ctx.fillStyle=myTeam; ctx.beginPath(); ctx.arc((p.x*scale)+off,(p.z*scale)+off,3,0,6); ctx.fill(); }
        });
        ctx.save(); ctx.translate((px*scale)+off,(pz*scale)+off); ctx.rotate(-euler.y); ctx.fillStyle='#0ff'; ctx.beginPath(); ctx.moveTo(0,-4); ctx.lineTo(3,3); ctx.lineTo(-3,3); ctx.fill(); ctx.restore();
    }

    document.addEventListener('pointerlockchange', ()=>locked=document.pointerLockElement===document.body);
    document.onmousedown=(e)=>{ 
        if(e.button===0) mouseDown=true; 
        if(e.button===2 && currentSlot===1 && myGunPref==='sniper') { camera.fov=20; camera.updateProjectionMatrix(); }
    };
    document.onmouseup=(e)=>{ 
        if(e.button===0) mouseDown=false; 
        if(e.button===2) { camera.fov=70; camera.updateProjectionMatrix(); }
    };
    document.oncontextmenu = e => e.preventDefault();

    document.onmousemove=e=>{
        if(!locked) return;
        euler.y-=e.movementX*0.002; euler.x-=e.movementY*0.002; euler.x=Math.max(-1.5, Math.min(1.5, euler.x));
        camera.quaternion.setFromEuler(euler);
    };
    
    window.onkeydown=e=>{
        const c=e.code;
        if(c==='Enter') {
            if(chatOpen) {
                const t=dom.chatIn.value.trim(); if(t) socket.emit('chatMessage',t);
                dom.chatIn.value=''; dom.chatIn.style.display='none'; chatOpen=false; document.body.requestPointerLock();
            } else {
                chatOpen=true; dom.chatIn.style.display='block'; dom.chatIn.focus(); document.exitPointerLock();
            }
            return;
        }
        if(chatOpen) return;

        if(c==='KeyW')keys.up=1; if(c==='KeyS')keys.down=1; if(c==='KeyA')keys.left=1; if(c==='KeyD')keys.right=1;
        if(c==='Space')keys.jump=1; if(c==='KeyG')keys.grenade=1;
        
        if(c==='Digit1'||c==='Numpad1')switchW(1); if(c==='Digit2'||c==='Numpad2')switchW(2); if(c==='Digit3'||c==='Numpad3')switchW(3);
        
        if(c==='Tab'){ e.preventDefault(); if(dom.sb) dom.sb.style.display='block'; updateSB(); document.exitPointerLock(); }
        if(c==='Escape'){ if(dom.pause && dom.pause.classList.contains('hidden')){dom.pause.classList.remove('hidden'); document.exitPointerLock();}else if(dom.pause){dom.pause.classList.add('hidden'); document.body.requestPointerLock();} }
    };
    window.onkeyup=e=>{
        const c=e.code;
        if(c==='KeyW')keys.up=0; if(c==='KeyS')keys.down=0; if(c==='KeyA')keys.left=0; if(c==='KeyD')keys.right=0;
        if(c==='Space')keys.jump=0; if(c==='KeyG')keys.grenade=0;
        if(c==='Tab' && dom.sb){ dom.sb.style.display='none'; if(!chatOpen && active) document.body.requestPointerLock(); }
    };

    function switchW(n) { 
        currentSlot=n; 
        slots.forEach((s,i)=>{ if(s) s.classList.toggle('w-active', i+1===n); }); 
        socket.emit('switchWeapon',n); 
        createLocalGun(); 
    }
    
    function updateSB() {
        if(!dom.sbBody) return;
        dom.sbBody.innerHTML='';
        Object.values(players).forEach(p=>{
            if(p.data) {
                let act=''; if(!clientGuest && p.data.username!==clientUser) act=`<button class="btn-sm" style="background:#27ae60" onclick="addF('${p.data.username}')">+</button>`;
                dom.sbBody.innerHTML+=`<tr><td>${p.data.username}</td><td style="color:${p.data.teamColor}">${p.data.teamColor}</td><td>${p.data.score}</td><td>${p.data.killStreak}</td><td>${act}</td></tr>`;
            }
        });
    }

    setInterval(()=>{
        if(active && locked && dom.death && dom.death.classList.contains('hidden') && dom.pause && dom.pause.classList.contains('hidden')) {
            if(mouseDown && currentSlot!==3) {
                const now=Date.now(); const rate=currentSlot===2?250:100;
                if(now-lastShootTime>rate) { socket.emit('shoot',{yaw:euler.y, pitch:euler.x}); lastShootTime=now; }
            } else if(mouseDown && currentSlot===3) {
                const now=Date.now();
                if(now-lastShootTime>500) { socket.emit('shoot',{yaw:euler.y, pitch:euler.x}); lastShootTime=now; }
            }
            socket.emit('playerInput',{...keys, rotation:euler.y});
        }
    },15);

    function anim() { requestAnimationFrame(anim); renderer.render(scene, camera); }
    anim();
    window.onresize=()=>{camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight)};
};