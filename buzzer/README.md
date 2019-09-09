# Buzzer for the blind test

## Bill of materials

A Wemod Mini D1 (or any ESP8266 board)
A stripe of 6 WS2812b RGB leds (a.k.a. Adafruit NeoPixels)
An arcade push button
A small bowerbank to power the system
A plastic cup as a housing

![Schematics](schema.png)

## Firmware

Firmware is made with arduino and depends on the following libraries:
- Websockets - https://github.com/Links2004/arduinoWebSockets
- Adafruit NeoPixel - https://github.com/adafruit/Adafruit_NeoPixel 
