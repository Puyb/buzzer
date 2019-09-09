'use strict';
const buttons = ['start', 'play', 'prev', 'next', 'pause', 'right', 'wrong', 'listen', '<<', '>>', 'reinit'];

function run2() {
    const buttonsDiv = $('#buttons').empty();
    const ws2 = new WebSocket(`ws://${location.hostname}:3000/?control=true`);
    ws2.addEventListener('error', err => {
        console.log('error', err);
        setTimeout(run2, 1000);
    });
    ws2.addEventListener('close', () => {
        console.log('close');
        setTimeout(run2, 1000);
    });
    ws2.addEventListener('message', message => {
        console.log('control', message.data);
        const data = JSON.parse(message.data);
        $('.teamButton').remove();
        for (const team of data.teams.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
            const d = $('<div>').addClass('teamButton').appendTo(buttonsDiv);
            $('<button></button>')
                .attr('type', 'button')
                .text(`${team.name} +1`)
                .click(() => {
                    ws2.send(JSON.stringify({
                        action: 'point',
                        team: team.name,
                        value: 1,
                    }));
                }).appendTo(d);
            $('<span>').text(team.score).appendTo(d);
            $('<button></button>')
                .attr('type', 'button')
                .text(`${team.name} -1`)
                .click(() => {
                    ws2.send(JSON.stringify({
                        action: 'point',
                        team: team.name,
                        value: -1,
                    }));
                }).appendTo(d);
            if (data.buzzers.includes(team.name)) {
                $('<button></button>')
                    .attr('type', 'button')
                    .text(`Light ${team.name}`)
                    .click(() => {
                        ws2.send(JSON.stringify({
                            action: 'buzzer',
                            team: team.name,
                        }));
                    }).appendTo(d);
            }
        }
        if (data.item && data.item.markers) {
            $('.markerButton').remove();
            for (const [marker, timestamp] of Object.entries(data.item.markers)) {
                $('<button></button>')
                    .addClass('markerButton')
                    .attr('type', 'button')
                    .text(marker)
                    .click(() => {
                        ws2.send(JSON.stringify({
                            action: 'seek',
                            timestamp,
                        }));
                    }).appendTo(buttonsDiv);
            }
        }
    });

    for (const button of buttons) {
        $('<button>')
            .attr('type', 'button')
            .text(button)
            .click(() => {
                ws2.send(JSON.stringify({
                    action: button,
                }));
            }).appendTo(buttonsDiv);
    }
    $('#volume').change(function () {
        ws2.send(JSON.stringify({
            action: 'volume',
            volume: this.value / 1000,
        }));
    });
}
run2();
