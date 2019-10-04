'use strict';

const fs = require('fs');
const express = require('express');
const app = express();
require('express-ws')(app);
const _ = require('lodash');
const config = require('./config.json');

const STATES = {
    start: ['round'],
    round: ['play'],
    play: ['pause', 'next'], // answer
    pause: ['play', 'next'],
    answer: ['right', 'wrong'],
    right: ['listen', 'next'],
    wrong: ['play', 'next'],
    listen: ['listenPause', 'next'],
    listenPause: ['listen', 'next'],
    next: ['play', 'round', 'end'],
    end: ['start'],
};

const BUZZER_BLACK = {mode: 0, color: '000000'};
const BUZZER_RAINBOW = {mode: 12};
const BUZZER_STATIC = {mode: 0};
const BUZZER_GYRO = {mode: 15, speed: 100};
const BUZZER_BLINK = {mode: 14, speed: 700};

const init = () => {
    return {
        round: 0,
        item: 0,
        winner: null,
        state: 'start', // round, play, pause, answer, wrong, right
        scores: {},
    };
};

let round, item, winner, state;
let savedState = init();
try {
    savedState = {
        ...init(),
        ...require('./saved-state.json'),
    };
} catch (err) {
}
round = savedState.round;
item = savedState.item;
winner = savedState.winner;
state = savedState.state;

const teams = _.keyBy(config.teams, 'name');
const game = config.game;
const displays = [];
const controls = [];

for (const [key, team] of Object.entries(teams)) {
    team.score = savedState.scores[key] || 0;
}

const updateDisplay = async extra => {
    await Promise.all([...displays, ...controls].map(async disp => {
        try {
            await disp.send(JSON.stringify({
                state,
                round: game[round] && game[round].title,
                item: game[round] && game[round].items[item],
                winner,
                team: _.omit(teams[winner], 'connection'),
                buzzers: Object.keys(teams).filter(t => teams[t].connection),
                teams: _.chain(teams).map(v => _.omit(v, 'connection')).sortBy('score').reverse().value(),
                next: STATES[state],
                rounds: game,
                ...extra,
            }));
        } catch (err) {
            console.log('err display send', err.stack);
            disp.close();
            _.remove(displays, disp);
            _.remove(controls, disp);
        }
    }));
};

const saveState = async () => {
    fs.writeFile('./saved-state.json', JSON.stringify({
        round,
        item,
        state,
        winner,
        scores: _.mapValues(teams, 'score'),
    }), (err) => {
        if (err) console.error(err);
    });
};

const changeAllBuzzers = async command => {
    await Promise.all(Object.values(teams).map(async team => {
        try {
            await changeBuzzer(team, command);
        } catch (err) {
            console.log('err buzzer send', command, err.stack);
            if (team.connection) {
                team.connection.close();
            }
            team.connection = null;
        }
    }));
};

const changeBuzzer = async (team, {mode, color, speed}) => team.connection && Promise.all([
    team.connection.send(`c ${color || team.color}`),
    speed && team.connection.send(`s ${speed}`),
    team.connection.send(`m ${mode || 0}`),
]);

const connectDisplay = async ws => {
    console.log('display');
    displays.push(ws);
    await updateDisplay();
};

const connectControl = async ws => {
    console.log('control');
    controls.push(ws);
    await updateDisplay();
    ws.on('message', async message => {
        try {
            const data = JSON.parse(message);
            let extra;
            switch (data.action) {
                case 'state':
                    if (!STATES[state].includes(data.state)) break;
                    state = data.state;
                    await onState[state](data);
                    break;
                case 'reinit':
                    savedState = init();
                    round = savedState.round;
                    item = savedState.item;
                    winner = savedState.winner;
                    state = savedState.state;
                    for (const team of Object.values(teams)) {
                        team.score = 0;
                    }
                    break;
                case 'buzzer':
                    await changeBuzzer(BUZZER_STATIC);
                    setTimeout(() => {
                        updateDisplay().catch(err => {
                            console.error('error while updating buzzer', err.stack);
                        });
                    }, 5000);
                    break;
                case 'command':
                    extra = data;
                    break;
                case 'point':
                    teams[data.team].score += data.value;
                    break;
            }
            await updateDisplay(extra);
            await saveState();
        } catch (err) {
            console.error('error receiving message from command', err.stack);
        }
    });
};
const onState = {
    start: async () => {
        round = 0;
        item = 0;
    },
    round: async () => {
    },
    play: async () => {
        winner = null;
        await changeAllBuzzers(BUZZER_RAINBOW);
    },
    pause: async () => {
        await changeAllBuzzers(BUZZER_BLACK);
    },
    answer: async () => {
    },
    right: async () => {
        teams[winner].score++;
        await changeBuzzer(teams[winner], BUZZER_GYRO);
        winner = null;
    },
    wrong: async () => {
        state = 'wrong';
        await changeBuzzer(teams[winner], BUZZER_BLACK);
        winner = null;
    },
    listen: async () => {
    },
    listenPause: async () => {
        await changeAllBuzzers(BUZZER_BLACK);
    },
    next: async data => {
        console.log(data);
        if (!data.previous) {
            state = 'play';
            await changeAllBuzzers(BUZZER_RAINBOW);
            item++;
            if (data.round != null) {
                round = data.round;
            }
            if (data.item != null) {
                item = data.item;
            }
            if (item >= game[round].items.length) {
                item = 0;
                round++;
                state = 'round';
                if (round >= game.length) {
                    round = 0;
                    state = 'start';
                }
            }
        } else {
            state = 'pause';
            await changeAllBuzzers(BUZZER_BLACK);
            item--;
            if (item < 0) {
                round--;
                if (round < 0) {
                    round = 0;
                }
                item = game[round].items.length - 1;
            }
        }
    },
    end: async () => {
    },
};

const connectBuzzer = async (ws, request) => {
    const ip = request.connection.remoteAddress;
    const team = _.find(teams, t => t.ip === ip) || _.find(teams, t => !t.connection);
    team.connection = ws;
    team.ip = ip;
    team.send = async (...commands) => Promise.all(
        commands.map(command => ws.send(command))
    );
    await updateDisplay();

    ws.on('close', () => {
        console.log('closed: %s', team);
        delete team.connection;
    });

    await changeBuzzer(team, BUZZER_STATIC);
    setTimeout(() => {
        changeBuzzer(team, BUZZER_BLACK).catch(err => {
            console.error('error while sending color', err.stack);
        });
    }, 5000);

    ws.on('message', async message => {
        try {
            console.log('message', state, winner, message);
            if (message !== 'hit') return;
            if (state === 'play' && !winner) {
                console.log('received: %s %s', team.name, message);

                winner = team.name;
                state = 'answer';
                await Promise.all(Object.values(teams).map(async t => {
                    if (winner === t.name) {
                        await changeBuzzer(t, BUZZER_BLINK);
                    } else {
                        await changeBuzzer(t, BUZZER_BLACK);
                    }
                }));
            }
            await updateDisplay({buzz: team.name});
        } catch (err) {
            console.error('error while receiving hit', err.stack);
        }
    });
};

app.use(express.static(`${__dirname}/../html`));

app.ws('/', async (ws, request) => {
    try {
        console.log('ws', request.query);
        if (request.query.display) {
            await connectDisplay(ws);
        } else if (request.query.control) {
            await connectControl(ws);
        } else {
            await connectBuzzer(ws, request);
        }
    } catch (err) {
        console.error('ws err', err.stack);
    }
});

app.listen(3000);
