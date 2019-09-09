#define BUTTON_PIN 0
#define USE_SERIAL Serial
#define LED_PIN    5
#define LED_COUNT 6
#define WIFI "buzzer"
#define KEY "buzzer1"
#define HOST "192.168.5.1"
#define PORT 3000

#include <Arduino.h>

#include <ESP8266WiFi.h>
#include <ESP8266WiFiMulti.h>

#include <WebSocketsClient.h>

#include <Hash.h>

#include <Adafruit_NeoPixel.h>

ESP8266WiFiMulti WiFiMulti;
WebSocketsClient webSocket;

Adafruit_NeoPixel strip(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);

char state[20] = "";
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
      sscanf((char*)payload, "%s %x", &state, &color);
      USE_SERIAL.printf("[WSc] state: %s, color: %x\n", state, color);
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

  strip.begin();           // INITIALIZE NeoPixel strip object (REQUIRED)
  strip.show();            // Turn OFF all pixels ASAP
  strip.setBrightness(50); // Set BRIGHTNESS to about 1/5 (max = 255)
}

void loop() {
  byte buttonState;
	webSocket.loop();
  buttonState = digitalRead(BUTTON_PIN);
  if (!buttonState && !strcmp(state, "rainbow")) {
    strncpy(state, "black", sizeof(state));
    webSocket.sendTXT("hit");
  }
  if (!strcmp(state, "gyro")) {
    gyro();
  } else if (!strcmp(state, "rainbow")) {
    rainbow();
  } else if (!strcmp(state, "solid")) {
    solid(color);
  } else {
    black();
  }
}
long last_refresh = 0;
void rainbow() {
  long now = millis() / 10;
  if (last_refresh == now) return;
  last_refresh = now;
  long firstPixelHue = now % (5 * 65536 / 256) * 256;

  for(int i=0; i<strip.numPixels(); i++) { // For each pixel in strip...
    int pixelHue = firstPixelHue + (i * 65536L / strip.numPixels());
    strip.setPixelColor(i, strip.gamma32(strip.ColorHSV(pixelHue)));
  }
  strip.show(); // Update strip with new contents
}

void gyro() {
  byte value;
  long now = millis() / 10;
  if (last_refresh == now) return;
  last_refresh = now;

  float fpos = fmod(now / 10.0, strip.numPixels());
  byte pos = (int)fpos;
  float mod = fmod(fpos, 1.0);
  for(int i=0; i<strip.numPixels(); i++) {
    value = 0;
    if (i == pos || i == (pos + strip.numPixels() / 2) % strip.numPixels()) {
      value = 255 * mod;
    } else if (i == (pos + 1) % strip.numPixels() || i == (pos + strip.numPixels() / 2 + 1) % strip.numPixels()) {
      value = 255 * (1 - mod);
    }
    strip.setPixelColor(i, ((byte*)&color)[0] * value, ((byte*)&color)[1] * value, ((byte*)&color)[2] * value);
  }
  strip.show(); // Update strip with new contents
}

void solid(uint32_t c) {
  long now = millis() / 10;
  if (last_refresh == now) return;
  last_refresh = now;

  for(int i=0; i<strip.numPixels(); i++) {
    strip.setPixelColor(i, c);
  }
  strip.show(); // Update strip with new contents
}

void black() {
  solid(0);
}
