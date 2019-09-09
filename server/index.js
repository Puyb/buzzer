'use strict';

const fs = require('fs');
const express = require('express');
const app = express();
require('express-ws')(app);
const _ = require('lodash');
const config = require('./config.json');
const teams = _.keyBy(config.teams, 'name');
const game = config.game;

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

const displays = [];
const controls = [];

const display = extra => {
    if (round >= game.length) {
        state = 'end';
    }
    for (const disp of [...displays, ...controls]) {
        try {
            disp.send(JSON.stringify({
                state,
                round: game[round] && game[round].title,
                item: game[round] && game[round].items[item],
                winner,
                team: _.omit(teams[winner], 'connection'),
                buzzers: Object.keys(teams).filter(t => teams[t].connection),
                teams: _.chain(teams).map(v => _.omit(v, 'connection')).sortBy('score').reverse().value(),
                ...extra,
            }));
        } catch (err) {
            console.log('err display send', err.stack);
            disp.close();
            _.remove(displays, disp);
            _.remove(controls, disp);
        }
    }
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
const buzzer = (mode, color) => {
    for (const [team, {connection: buzz}] of Object.entries(teams)) {
        if (!buzz) continue;
        try {
            buzz.send(`${mode} ${color}`);
        } catch (err) {
            console.log('err buzzer send', err.stack);
            buzz.close();
            teams[team].connection = null;
        }
    }
};
for (const [key, team] of Object.entries(teams)) {
    team.score = savedState.scores[key] || 0;
}

app.use(express.static(`${__dirname}/../html`));

app.ws('/', (ws, request) => {
    try {
        console.log('ws', request.query);
        if (request.query.display) {
            console.log('display');
            displays.push(ws);
            display();
        } else if (request.query.control) {
            console.log('control');
            controls.push(ws);
            display();
            ws.on('message', message => {
                const data = JSON.parse(message);
                let extra;
                switch (data.action) {
                    case 'start':
                        state = 'round';
                        round = 0;
                        item = 0;
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
                    case 'play':
                        if (!['round', 'start', 'pause', 'wrong'].includes(state)) return;
                        state = 'play';
                        buzzer('rainbow', '000000');
                        break;
                    case 'listen':
                        if (!['right', 'pause'].includes(state)) return;
                        state = 'listen';
                        break;
                    case 'next':
                        if (!['right', 'wrong', 'next', 'play', 'pause', 'listen'].includes(state)) return;
                        state = 'play';
                        buzzer('rainbow', '000000');
                        item++;
                        if (item >= game[round].items.length) {
                            item = 0;
                            round++;
                            state = 'round';
                        }
                        break;
                    case 'prev':
                        if (!['right', 'wrong', 'next', 'play', 'pause', 'listen', 'end'].includes(state)) return;
                        state = 'pause';
                        buzzer('rainbow', '000000');
                        item--;
                        if (item < 0) {
                            round--;
                            if (round < 0) {
                                round = 0;
                            }
                            item = game[round].items.length - 1;
                        }
                        break;
                    case 'pause':
                        if (state !== 'play') return;
                        state = 'pause';
                        buzzer('black', '000000');
                        break;
                    case 'right':
                        state = 'right';
                        // count point
                        teams[winner].score++;
                        winner = null;
                        break;
                    case 'wrong':
                        state = 'wrong';
                        winner = null;
                        break;
                    case 'buzzer':
                        teams[data.team].connection.send(`solid ${teams[data.team].color}`);
                        setTimeout(() => {
                            display();
                        }, 5000);
                        break;
                    case '<<':
                        extra = {
                            action: 'seek',
                            relative: -10,
                        };
                        break;
                    case '>>':
                        extra = {
                            action: 'seek',
                            relative: 10,
                        };
                        break;
                    case 'seek':
                        extra = {
                            action: 'seek',
                            timestamp: data.timestamp,
                        };
                        break;
                    case 'volume':
                        extra = {
                            action: 'volume',
                            volume: data.volume,
                        };
                        break;
                    case 'point':
                        teams[data.team].score += data.value;
                        break;
                }
                display(extra);
            });
        } else {
            const team = _.find(teams, t => !t.connection);
            team.connection = ws;
            display();

            ws.on('close', () => {
                console.log('closed: %s', team);
                delete team.connection;
            });

            ws.send(`solid ${team.color}`);
            setTimeout(() => {
                ws.send(`black ${team.color}`);
            }, 5000);

            ws.on('message', message => {
                if (winner) return;
                if (message !== 'hit') return;
                console.log('received: %s %s', team.name, message);

                winner = team.name;
                state = 'answer';
                display();
                for (const t of Object.values(teams)) {
                    if (!t.connection) continue;
                    if (winner === t.name) {
                        t.connection.send(`solid ${t.color}`);
                    } else {
                        t.connection.send(`black ${t.color}`);
                    }
                }
            });
        }
    } catch (err) {
        console.error('ws err', err.stack);
    }
});

app.listen(3000);
