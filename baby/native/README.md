# Baby Log — Android app

The same web app (`../`) wrapped with [Capacitor](https://capacitorjs.com) so it
can do what a web page can't:

- **Reminders with the app closed** — `js/native.js` schedules them as Android
  local notifications (`@capacitor/local-notifications`).
- **Running timers on the lock screen** — sleep, breastfeeding, bottle, pumping
  and tummy time as ongoing notifications with a live clock and buttons
  (`TimerNotificationPlugin.java`). Buttons open `babylog://timer?…` links that
  run the same action as the Today buttons.
- **Voice logging** with the phone's own speech engine
  (`@capacitor-community/speech-recognition`; works offline if the language is
  downloaded on the phone).
- **App-icon shortcuts** — Sleep, Diaper, Feed, Voice (`res/xml/shortcuts.xml`,
  `babylog://do/<what>`).
- **A durable copy of the log** in Android storage (`@capacitor/preferences`).

## Build

Needs JDK 21 and the Android SDK (platform 36). Node is only used to build.

```bash
cd baby/native
npm install                       # once
npm run sync                      # copy ../ into www/ and into the Android project
cd android && gradlew.bat assembleDebug      # → app/build/outputs/apk/debug/app-debug.apk
```

(On this PC: `JAVA_HOME=C:\Users\Poll David\.jdks\jdk-21…` — a portable JDK, so
the system Java 17 is untouched.)

Install on a phone with USB debugging on: `adb install -r app/build/outputs/apk/debug/app-debug.apk`,
or copy the APK to the phone and open it (allow "install unknown apps").

Rebuild after any change to the web app; `www/` and the copied assets are not
committed. The debug APK is signed with the local debug key — fine for your own
phones; a Play Store release needs a proper signing key.
