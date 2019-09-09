'use strict';
const [audio, audioAnswer, audioRight, audioWrong] = document.getElementsByTagName('audio');
let currentAudioSrc = null;

function run() {
    const ws = new WebSocket(`ws://${location.hostname}:3000/?display=true`);
    ws.addEventListener('error', err => {
        console.log('error', err);
        setTimeout(run, 1000);
    });
    ws.addEventListener('close', () => {
        console.log('close');
        setTimeout(run, 1000);
    });
    let state;
    ws.addEventListener('message', msg => {
        //console.log('display', msg.data);
        const w = document.getElementById('winner');
        const displayControl = document.getElementById('control');

        const data = JSON.parse(msg.data);
        console.log('display', data.teams.map(v => v.name + v.score));
        for (const cl of ['start', 'round', 'play', 'pause', 'answer', 'wrong', 'right'])
            document.body.classList.remove(cl);
        document.body.classList.add(data.state);
        w.innerHTML = '';
        $('[data-prop]').each(function() {
            const el = $(this);
            const path = el.data('prop').split('.');
            el.text(path.reduce((o, p) => o && o[p], data))
        });
        if (displayControl) {
            displayControl.innerHTML = JSON.stringify(data, null, 4);
        }

        let i = 0;
        for (const team of data.teams) {
            let item = $(`.score-${team.name}`);
            if (!item.length) {
                console.log('create', team.name);
                item = $(`<div class="score-${team.name}">`)
                        .html(`
                    <div><img src="${team.logo}" /></div>
                    <span>${team.score}</span>
                `).appendTo($('#scores'));
            }
            item.css('top', `${20 * i}%`);
            item.find('span').text(team.score);
            i++;
        }
        if (state !== data.state) {
            state = data.state;
            switch (data.state) {
                case 'start':
                    break;
                case 'round':
                    if (audio) audio.pause();
                    w.innerHTML = data.round;
                    break;
                case 'play':
                case 'listen':
                    if (audio) {
                        if (data.item.src !== currentAudioSrc) {
                            console.log('load', data.item.src);
                            currentAudioSrc = data.item.src;
                            audio.src = data.item.src;
                        }
                        audio.play();
                    }
                    break;
                case 'pause':
                    if (audio) audio.pause();
                    break;
                case 'answer':
                    w.innerHTML = `<img src="${data.team.logo}">`;

                    if (audio) {
                        audioAnswer.play();
                        audio.pause();
                    }
                    break;
                case 'right':
                    w.innerHTML = `Right answer<br />${data.item.title}`;
                    if (audio) {
                        audioRight.play();
                    }
                    break;
                case 'wrong':
                    w.innerHTML = 'Wrong answer';
                    if (audio) {
                        audioWrong.play();
                    }
                    break;
                case 'end':
                    if (audio) {
                        audioWrong.pause();
                    }
                    break;
            }
        }
        if (audio && data.action === 'seek') {
            if (data.relative) {
                audio.currentTime += data.relative;
            } else {
                audio.currentTime = data.timestamp;
            }
        }
        if (audio && data.action === 'volume') {
            audio.volume = data.volume;
        }
    });
}
run();
