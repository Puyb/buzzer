#define BUTTON_PIN 0
#define DEBOUNCE_DELAY 50
#define LED_PIN    5
#define LED_COUNT 6
#define HOST "192.168.42.17"
#define PORT 3000

#include <Arduino.h>

#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <AutoConnect.h>

#include <WebSocketsClient.h>

// #include <Adafruit_NeoPixel.h>
#include <WS2812FX.h>

ESP8266WebServer Server;
AutoConnect Portal(Server);
AutoConnectConfig Config;
WebSocketsClient webSocket;

WS2812FX ws2812fx = WS2812FX(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);

uint32 color = 0;

void rootPage() {
  Server.sendHeader("Location", String("/_ac"), true);
  Server.send(200, "text/html", String(""));
}


ACText(header, "Buzzer settings");
ACInput(host_input, "", "Server host", "^.{1,32}$");
ACInput(port_input, "3000", "Server host", "^[0-9]{1,5}$");
ACSubmit(save, "Save settings", "/buzzer_settings_save");
AutoConnectAux  buzzer_settings_aux("/buzzer_settings", "Buzzer Settings", true, { header, host_input, port_input, save });

ACText(caption2, "<h4>Settings saved:</h4>", "text-align:center;color:#2f4f4f;padding:10px;");
ACText(parameters);
AutoConnectAux buzzer_settings_save_aux("/buzzer_settings_save", "MQTT Setting", false, { caption2, parameters });

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
		case WStype_DISCONNECTED:
			Serial.printf("[WSc] Disconnected!\n");
			break;
		case WStype_CONNECTED:
			Serial.printf("[WSc] Connected to url: %s\n", payload);
			break;
		case WStype_TEXT:
      Serial.printf("[WSc] payload: %s", payload);
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

String saveParams(AutoConnectAux& aux, PageArgument& args) {
  host_input.value.trim();
  port_input.value.trim();

  // Echo back saved parameters to AutoConnectAux page.
  String echo = "Host: " + host_input.value + "<br>";
  echo += "Port: " + port_input.value + "<br>";
  parameters.value = echo;

  return String("");
}


void setupWebSocket() {
  char server_host[32];
  int server_port;
  host_input.value.toCharArray(server_host, 32);
  server_port = port_input.value.toInt();

  webSocket.begin(server_host, server_port, "/");
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
  webSocket.enableHeartbeat(15000, 3000, 2);
}

void setup() {
	Serial.begin(115200);
	Serial.setDebugOutput(true);
  Serial.println("Starting...");

  pinMode(BUTTON_PIN, INPUT);

  ws2812fx.init();
  ws2812fx.setBrightness(100);
  ws2812fx.setSpeed(200);
  ws2812fx.setMode(FX_MODE_RAINBOW_CYCLE);
  ws2812fx.start();

  Config.title = "Buzzer";
  Config.apid = "Buzzer-" + String(ESP.getChipId(), HEX);
  Config.psk = "";
  Config.ticker = true;
  Config.tickerPort = 2;
  Config.tickerOn = LOW;
  Portal.config(Config);
  Portal.join({ buzzer_settings_aux, buzzer_settings_save_aux });
  Portal.on("/buzzer_settings_save", saveParams);
  Server.on("/", rootPage);
  if (Portal.begin()) {
    Serial.println("WiFi connected: " + WiFi.localIP().toString());
    setupWebSocket();
  }
}

int buttonState = LOW;
int lastButtonState = HIGH;
unsigned long lastDebounceTime = 0;
void loop() {
	Portal.handleClient();
	webSocket.loop();
  int reading = digitalRead(BUTTON_PIN);
  if (reading != lastButtonState) {
    lastDebounceTime = millis();
  }

  if ((millis() - lastDebounceTime) > DEBOUNCE_DELAY) {
    if (reading != buttonState) {
      buttonState = reading;
      if (!reading) {
        Serial.println("hit");
        webSocket.sendTXT("hit");
      }
    }
  }
  lastButtonState = reading;
  ws2812fx.service();
}
