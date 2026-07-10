var game = new Chess();
var board = null;
var myColor = 'w';
var socket = null; 
var isAiGame = false;
var opponentLeft = false;

var whiteTime = 0;
var blackTime = 0;
var timerInterval = null;
var timeoutLoser = null;

var resignedPlayer = null;
var manualDraw = false;

var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
var gameOverSoundPlayed = false;
var currentAiLevel = 3; 

function removeHighlights() {
    $('#board .square-55d63').removeClass('highlight-move');
}

function highlightMove(source, target) {
    removeHighlights();
    $('#board .square-' + source).addClass('highlight-move');
    $('#board .square-' + target).addClass('highlight-move');
}

function synthBeep(freq, type, duration, vol = 0.1) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    var oscillator = audioCtx.createOscillator();
    var gainNode = audioCtx.createGain();
    
    oscillator.type = type; 
    oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(vol, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + duration);
}

function playSound(soundType) {
    if (soundType === 'move') {
        synthBeep(300, 'sine', 0.12, 0.4); 
    }
    if (soundType === 'start') {
        synthBeep(587.33, 'triangle', 0.25, 0.2); 
        setTimeout(() => synthBeep(880, 'triangle', 0.4, 0.2), 120); 
    }
    if (soundType === 'win') {
        synthBeep(523.25, 'sine', 0.15, 0.25); 
        setTimeout(() => synthBeep(659.25, 'sine', 0.15, 0.25), 100); 
        setTimeout(() => synthBeep(783.99, 'sine', 0.4, 0.25), 200); 
    }
    if (soundType === 'lose') {
        synthBeep(220, 'sawtooth', 0.25, 0.15); 
        setTimeout(() => synthBeep(146.83, 'sawtooth', 0.5, 0.15), 200); 
    }
}

function triggerScreenShake() {
    var boardEl = document.getElementById('board');
    if (boardEl) {
        boardEl.classList.remove('shake-anim');
        void boardEl.offsetWidth; 
        boardEl.classList.add('shake-anim');
    }
}

function startClocks() {
    var minutes = parseInt(document.getElementById('timeControl').value);
    whiteTime = minutes * 60;
    blackTime = minutes * 60;
    timeoutLoser = null;
    
    updateClockHTML();
    
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(tickTimer, 1000);
}

function tickTimer() {
    if (game.game_over() || timeoutLoser || resignedPlayer || manualDraw) return;

    if (game.turn() === 'w') {
        whiteTime--;
        if (whiteTime <= 0) { whiteTime = 0; timeoutLoser = 'w'; }
    } else {
        blackTime--;
        if (blackTime <= 0) { blackTime = 0; timeoutLoser = 'b'; }
    }
    
    updateClockHTML();
    if (timeoutLoser) updateStatus();
}

function updateClockHTML() {
    function formatTime(seconds) {
        var m = Math.floor(seconds / 60);
        var s = seconds % 60;
        return (m < 10 ? "0" + m : m) + ":" + (s < 10 ? "0" + s : s);
    }
    
    if (myColor === 'w') {
        document.getElementById('playerClock').innerText = formatTime(whiteTime);
        document.getElementById('opponentClock').innerText = formatTime(blackTime);
    } else {
        document.getElementById('playerClock').innerText = formatTime(blackTime);
        document.getElementById('opponentClock').innerText = formatTime(whiteTime);
    }
}

document.getElementById('findMatchBtn').addEventListener('click', function() {
    isAiGame = false;
    document.getElementById('menuOptions').classList.add('hidden');
    document.getElementById('lobbyWaiting').classList.remove('hidden');

    socket = new WebSocket("ws://localhost:8001");

    socket.onopen = function() {
        var timePref = document.getElementById('timeControl').value;
        var myName = window.playerName || "Guest"; 
        
        socket.send(JSON.stringify({
            "type": "join", 
            "time": timePref,
            "name": myName
        }));
    };

    socket.onmessage = function(event) {
        var data = JSON.parse(event.data);
        
        if (data.type === 'init') {
            document.getElementById('menu').classList.add('hidden');
            document.getElementById('gameArea').classList.remove('hidden');
            
            myColor = data.color;
            board.orientation(myColor === 'b' ? 'black' : 'white');
            board.resize(); 
            startClocks(); 
            
            document.getElementById('opponentNameLabel').innerText = data.opponent_name;
            
            playSound('start'); 
            gameOverSoundPlayed = false;
            opponentLeft = false;
            
            updateStatus();
        }
        else if (data.type === 'disconnect') {
            opponentLeft = true;
            updateStatus();
        } 
        else {
            if (data.type === 'resign') {
                resignedPlayer = (myColor === 'w') ? 'b' : 'w';
                updateStatus();
            } 
            else if (data.type === 'offer_draw') {
                document.getElementById('drawOfferModal').classList.remove('hidden');
            } 
            else if (data.type === 'accept_draw') {
                manualDraw = true;
                updateStatus();
            } 
            else if (data.type === 'decline_draw') {
                $('#offerDrawBtn').text('🤝 Offer Draw').prop('disabled', false);
                alert("Opponent declined the draw offer.");
            } 
            else if (data.from && data.to) {
                playSound('move'); 
                game.move(data);
                board.position(game.fen());
                highlightMove(data.from, data.to);
                updateStatus();
            }
        }
    };
});

document.getElementById('cancelMatchBtn').addEventListener('click', function() {
    if (socket) socket.close();
    document.getElementById('lobbyWaiting').classList.add('hidden');
    document.getElementById('menuOptions').classList.remove('hidden');
});

document.getElementById('quitBtn').addEventListener('click', function() {
    if (socket) { socket.close(); socket = null; }
    
    game.reset();
    removeHighlights();
    selectedSquare = null;
    pendingPromotion = null;
    resignedPlayer = null;
    manualDraw = false;

    // FIX: Remove the shake animation class so it doesn't replay next time!
    var boardEl = document.getElementById('board');
    if (boardEl) boardEl.classList.remove('shake-anim');
    
    $('#offerDrawBtn').text('🤝 Offer Draw').prop('disabled', false);
    
    board.start(false);
    board.orientation('white');
    isAiGame = false;
    opponentLeft = false;
    gameOverSoundPlayed = false;
    if (timerInterval) clearInterval(timerInterval);

    document.getElementById('gameArea').classList.add('hidden');
    document.getElementById('menu').classList.remove('hidden');
    document.getElementById('menuOptions').classList.remove('hidden');
    document.getElementById('lobbyWaiting').classList.add('hidden');
});

var engine = null;

$.get('stockfish.js', function(stockfishCode) {
    var blob = new Blob([stockfishCode], {type: 'application/javascript'});
    engine = new Worker(URL.createObjectURL(blob));
    
    engine.onmessage = function(event) {
        var line = event.data;
        if (line && line.indexOf("bestmove") > -1) {
            var match = line.match(/^bestmove ([a-h][1-8])([a-h][1-8])([qrbn])?/);
            if (match) {
                game.move({
                    from: match[1],
                    to: match[2],
                    promotion: match[3] ? match[3] : 'q'
                });
                
                playSound('move'); 
                board.position(game.fen());
                highlightMove(match[1], match[2]); 
                updateStatus();
            }
        }
    };
}, 'text'); 

document.getElementById('playAiBtn').addEventListener('click', function() {
    isAiGame = true;
    
    if (engine) {
        engine.postMessage("uci");
        var stockfishSkill = Math.round((currentAiLevel - 1) * (20 / 9)); 
        engine.postMessage("setoption name Skill Level value " + stockfishSkill);
    }
    
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('gameArea').classList.remove('hidden');
    document.getElementById('opponentNameLabel').innerText = "Stockfish (Lv " + currentAiLevel + ")";
    
    myColor = 'w'; 
    board.orientation('white');
    board.resize();
    startClocks();
    
    playSound('start'); 
    gameOverSoundPlayed = false;
    
    updateStatus();
});

function makeAiMove() {
    if (game.game_over() || timeoutLoser || resignedPlayer || manualDraw || !engine) return;
    engine.postMessage("position fen " + game.fen());
    engine.postMessage("go movetime 500");
}

function updateStatus() {
    var statusText = '';
    var moveColor = game.turn() === 'w' ? 'White' : 'Black';

    if (opponentLeft) {
        statusText = 'Game over, opponent disconnected.';
    } else if (resignedPlayer) {
        var winner = resignedPlayer === 'w' ? 'Black' : 'White';
        statusText = 'Game over, ' + winner + ' wins by resignation.';
    } else if (manualDraw) {
        statusText = 'Game over, draw by mutual agreement.';
    } else if (timeoutLoser) {
        var winner = timeoutLoser === 'w' ? 'Black' : 'White';
        statusText = 'Game over, ' + winner + ' wins on time.';
    } else if (game.in_checkmate()) {
        statusText = 'Game over, ' + moveColor + ' is in checkmate.';
    } else if (game.in_draw()) {
        statusText = 'Game over, drawn position.';
    } else {
        statusText = moveColor + ' to move';
        if (game.in_check()) statusText += ' (Check!)';
    }
    
    document.getElementById('status').innerText = statusText;

    if (opponentLeft || timeoutLoser || resignedPlayer || manualDraw || game.game_over()) {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        
        if (!gameOverSoundPlayed) {
            var isWin = opponentLeft || 
                        (timeoutLoser && timeoutLoser !== myColor) || 
                        (resignedPlayer && resignedPlayer !== myColor) || 
                        (game.in_checkmate() && game.turn() !== myColor);
            
            if (isWin) {
                playSound('win');
            } else if (manualDraw || game.in_draw()) {
                playSound('lose');
            } else {
                playSound('lose');
                triggerScreenShake(); 
            }
            gameOverSoundPlayed = true;
        }
    }
}

$('#resignBtn').on('click', function() {
    if (game.game_over() || timeoutLoser || opponentLeft || resignedPlayer || manualDraw) return;
    
    resignedPlayer = myColor;
    if (!isAiGame && socket) {
        socket.send(JSON.stringify({ type: 'resign' }));
    }
    updateStatus();
});

$('#offerDrawBtn').on('click', function() {
    if (game.game_over() || timeoutLoser || opponentLeft || resignedPlayer || manualDraw) return;
    if (isAiGame) {
        alert("The AI does not accept draws!");
        return;
    }
    
    socket.send(JSON.stringify({ type: 'offer_draw' }));
    $(this).text('⏳ Sent...').prop('disabled', true);
});

$('#acceptDrawBtn').on('click', function() {
    document.getElementById('drawOfferModal').classList.add('hidden');
    manualDraw = true;
    socket.send(JSON.stringify({ type: 'accept_draw' }));
    updateStatus();
});

$('#declineDrawBtn').on('click', function() {
    document.getElementById('drawOfferModal').classList.add('hidden');
    socket.send(JSON.stringify({ type: 'decline_draw' }));
});

var selectedSquare = null;
var tapDebounce = false;
var pendingPromotion = null; 

function executeMove(source, target, promoPiece) {
    var move = game.move({ from: source, to: target, promotion: promoPiece });
    
    board.position(game.fen(), false); 
    highlightMove(move.from, move.to);
    playSound('move');
    updateStatus();

    if (isAiGame) {
        window.setTimeout(makeAiMove, 250);
    } else {
        socket.send(JSON.stringify(move));
    }
}

function onDragStart(source, piece, position, orientation) {
    if (game.game_over() || timeoutLoser || opponentLeft || resignedPlayer || manualDraw) return false; 
    if ((myColor === 'w' && piece.search(/^b/) !== -1) ||
        (myColor === 'b' && piece.search(/^w/) !== -1)) return false;
    if (game.turn() !== myColor) return false;
}

function onDrop(source, target) {
    if (source === target) {
        if (selectedSquare === source) {
            selectedSquare = null;
            removeHighlights();
        } else {
            selectedSquare = source;
            removeHighlights();
            $('#board .square-' + source).addClass('highlight-move');
        }
        return 'snapback'; 
    }

    selectedSquare = null; 
    
    var testMove = game.move({ from: source, to: target, promotion: 'q' });
    if (testMove === null) return 'snapback';
    game.undo(); 
    
    var isPawn = game.get(source) && game.get(source).type === 'p';
    var isLastRank = (target[1] === '8' || target[1] === '1');
    
    if (isPawn && isLastRank) {
        pendingPromotion = { from: source, to: target };
        document.getElementById('promotionModal').classList.remove('hidden');
        return; 
    }
    
    executeMove(source, target, 'q');
}

$('#board').on('touchstart mousedown', '.square-55d63, .piece-417db', function(e) {
    if (tapDebounce || !selectedSquare) return;
    tapDebounce = true;
    setTimeout(() => tapDebounce = false, 150);

    var $square = $(e.target).closest('.square-55d63');
    var targetSquare = $square.attr('data-square');
    
    if (!targetSquare) {
        var match = $square.attr('class') && $square.attr('class').match(/square-(\w{2})/);
        if (match) targetSquare = match[1];
    }
    
    if (!targetSquare) return;

    var pieceOnSquare = game.get(targetSquare);
    if (pieceOnSquare && pieceOnSquare.color === myColor) return;

    e.preventDefault(); 
    
    var testMove = game.move({ from: selectedSquare, to: targetSquare, promotion: 'q' });
    if (testMove === null) {
        selectedSquare = null;
        removeHighlights();
        return;
    }
    game.undo();
    
    var isPawn = game.get(selectedSquare) && game.get(selectedSquare).type === 'p';
    var isLastRank = (targetSquare[1] === '8' || targetSquare[1] === '1');
    
    if (isPawn && isLastRank) {
        pendingPromotion = { from: selectedSquare, to: targetSquare };
        document.getElementById('promotionModal').classList.remove('hidden');
        selectedSquare = null;
        removeHighlights();
        return;
    }
    
    var finalSource = selectedSquare;
    selectedSquare = null;
    executeMove(finalSource, targetSquare, 'q');
});

$('.promo-btn').on('click', function() {
    if (!pendingPromotion) return;
    
    var pieceChoice = $(this).attr('data-piece'); 
    document.getElementById('promotionModal').classList.add('hidden');
    
    executeMove(pendingPromotion.from, pendingPromotion.to, pieceChoice);
    pendingPromotion = null;
});

$('#cancelPromoBtn').on('click', function() {
    document.getElementById('promotionModal').classList.add('hidden');
    pendingPromotion = null;
    board.position(game.fen()); 
});

function onSnapEnd() { board.position(game.fen()); }

var config = {
    draggable: true, position: 'start',
    onDragStart: onDragStart, onDrop: onDrop, onSnapEnd: onSnapEnd
};
board = Chessboard('board', config);

var checkName = setInterval(function() {
    if (window.playerName) {
        document.getElementById('playerNameLabel').innerText = window.playerName;
        clearInterval(checkName);
    }
}, 200); 
setTimeout(function() { clearInterval(checkName); }, 3000);

function updateLevelUI(selectedLevel) {
    $('.level-btn').each(function() {
        var val = parseInt($(this).attr('data-val'));
        $(this).removeClass('active track');
        if (val === selectedLevel) $(this).addClass('active');
        else if (val < selectedLevel) $(this).addClass('track');
    });
}
updateLevelUI(currentAiLevel);
$('.level-btn').on('click', function() {
    currentAiLevel = parseInt($(this).attr('data-val'));
    updateLevelUI(currentAiLevel);
});