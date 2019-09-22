#define BUTTON_PIN 0
#define DEBOUNCE_DELAY 50
#define USE_SERIAL Serial
#define LED_PIN    5
#define LED_COUNT 6
#define WIFI "Puyb.net"
#define KEY "badbadc0de"
#define HOST "192.168.42.17"
#define PORT 3000

#include <Arduino.h>

#include <ESP8266WiFi.h>
#include <ESP8266WiFiMulti.h>

#include <WebSocketsClient.h>

#include <Hash.h>

// #include <Adafruit_NeoPixel.h>
#include <WS2812FX.h>

ESP8266WiFiMulti WiFiMulti;
WebSocketsClient webSocket;

WS2812FX ws2812fx = WS2812FX(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);

uint32 color = 0;

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
		case WStype_DISCONNECTED:
			USE_SERIAL.printf("[WSc] Disconnected!\n");
			break;
		case WStype_CONNECTED:
			USE_SERIAL.printf("[WSc] Connected to url: %s\n", payload);
			break;
		case WStype_TEXT:
      USE_SERIAL.printf("[WSc] payload: %s", payload);
      if (strcmp((char*)payload,"b+") == 0) {
        ws2812fx.increaseBrightness(25);
        Serial.print(F("Increased brightness by 25 to: "));
        Serial.println(ws2812fx.getBrightness());
      }
    
      if (strcmp((char*)payload,"b-") == 0) {
        ws2812fx.decreaseBrightness(25); 
        Serial.print(F("Decreased brightness by 25 to: "));
        Serial.println(ws2812fx.getBrightness());
      }
    
      if (strncmp((char*)payload,"b ",2) == 0) {
        uint8_t b = (uint8_t)atoi((char*)payload + 2);
        ws2812fx.setBrightness(b);
        Serial.print(F("Set brightness to: "));
        Serial.println(ws2812fx.getBrightness());
      }
    
      if (strcmp((char*)payload,"s+") == 0) {
        ws2812fx.setSpeed(ws2812fx.getSpeed() * 1.2);
        Serial.print(F("Increased speed by 20% to: "));
        Serial.println(ws2812fx.getSpeed());
      }
    
      if (strcmp((char*)payload,"s-") == 0) {
        ws2812fx.setSpeed(ws2812fx.getSpeed() * 0.8);
        Serial.print(F("Decreased speed by 20% to: "));
        Serial.println(ws2812fx.getSpeed());
      }
    
      if (strncmp((char*)payload,"s ",2) == 0) {
        uint16_t s = (uint16_t)atoi((char*)payload + 2);
        ws2812fx.setSpeed(s); 
        Serial.print(F("Set speed to: "));
        Serial.println(ws2812fx.getSpeed());
      }
    
      if (strncmp((char*)payload,"m ",2) == 0) {
        uint8_t m = (uint8_t)atoi((char*)payload + 2);
        ws2812fx.setMode(m);
        Serial.print(F("Set mode to: "));
        Serial.print(ws2812fx.getMode());
        Serial.print(" - ");
        Serial.println(ws2812fx.getModeName(ws2812fx.getMode()));
      }
    
      if (strncmp((char*)payload,"c ",2) == 0) {
        uint32_t c = (uint32_t)strtoul((char*)payload + 2, NULL, 16);
        ws2812fx.setColor(c);
        Serial.print(F("Set color to: 0x"));
        Serial.println(ws2812fx.getColor(), HEX);
      }
      break;
  }

}

void setup() {
	// USE_SERIAL.begin(921600);
	USE_SERIAL.begin(115200);

	//Serial.setDebugOutput(true);
	USE_SERIAL.setDebugOutput(true);

	USE_SERIAL.println();
	USE_SERIAL.println();
	USE_SERIAL.println();

	for(uint8_t t = 4; t > 0; t--) {
		USE_SERIAL.printf("[SETUP] BOOT WAIT %d...\n", t);
		USE_SERIAL.flush();
		delay(1000);
	}

	WiFiMulti.addAP(WIFI, KEY);

	//WiFi.disconnect();
	while(WiFiMulti.run() != WL_CONNECTED) {
		delay(100);
	}

	// server address, port and URL
	webSocket.begin(HOST, PORT, "/");

	// event handler
	webSocket.onEvent(webSocketEvent);

	// use HTTP Basic Authorization this is optional remove if not needed
	// webSocket.setAuthorization("user", "Password");

	// try ever 5000 again if connection has failed
	webSocket.setReconnectInterval(5000);
  
  // start heartbeat (optional)
  // ping server every 15000 ms
  // expect pong from server within 3000 ms
  // consider connection disconnected if pong is not received 2 times
  webSocket.enableHeartbeat(15000, 3000, 2);

  pinMode(BUTTON_PIN, INPUT);

  ws2812fx.init();
  ws2812fx.setBrightness(100);
  ws2812fx.setSpeed(200);
  ws2812fx.setMode(FX_MODE_RAINBOW_CYCLE);
  ws2812fx.start();
}

int buttonState = LOW;
int lastButtonState = HIGH;
unsigned long lastDebounceTime = 0;
void loop() {
	webSocket.loop();
  int reading = digitalRead(BUTTON_PIN);
  if (reading != lastButtonState) {
    lastDebounceTime = millis();
  }

  if ((millis() - lastDebounceTime) > DEBOUNCE_DELAY) {
    if (reading != buttonState) {
      buttonState = reading;
      if (!reading) {
        USE_SERIAL.println("hit");
        webSocket.sendTXT("hit");
      }
    }
  }
  lastButtonState = reading;
  ws2812fx.service();
}
