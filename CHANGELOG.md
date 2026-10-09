# Changelog
## Version 1.0 (Alpha)
- Initiale Veröffentlichung mit Netzbetreibererkennung nur für Chromium.

## Version 1.1 (Beta)
- Erweiterung des Funktionsumfangs um diverse UX-Verbesserungen (siehe Funktionsbeschreibung).
- Kompatibel mit Firefox.

## Version 1.2
- Verbesserte Manifest-Datei

## Version 1.2.1
- Reduzierte Berechtigungen

## Version 1.2.2
- Wichtige Verbesserungen der Erkennung der Netzbetreiber (Sender mit nur 2G bzw. GSM je nach Netzbetreiber sowie nur LTE-Sender).
- Chromium-Browser können auch auf der Senderkataster-Webseite ohne www-Subdomain die Erweiterung nutzen (funktionierte bislang nur auf https://www.senderkataster.at/).
Lokalisierung auf Deutsch für den Microsoft Edge Add-Ons Store.

## Version 1.2.3
- Kleine Verbesserung in der Erkennung der Netzbetreiber.
- In Chromium-Browsern wird nun das richtige Icon angezeigt.
- Eine vereinigte Manifest-Datei für alle Browser.
- Lokalisierung auf Deutsch für alle Browser.

## Version 1.2.4
- Durch Änderungen am Senderkataster wurden in Kombination mit der Erweiterung bei den Popups je nach Display Inhalte außerhalb des Popups dargestellt.
- Das Informationsfeld wird nun auch auf kleinen Bildschirmen automatisch versteckt.
- Das Informationsfeld kann nun auf größeren Displays auch wieder geöffnet werden.
- Behebt einen Fehler, durch welchen unter Firefox für Android manche Icons nicht dargestellt wurden.
- Weitere Darstellungsoptimierungen.

## Version 1.2.5
- Das Farbschema der Netzbetreiber wurde an jenes der RTR angepasst (A1 = grau; Magenta = grün; Drei = blau).
- Kleine Fehlerbehebung.

## Version 1.3.0
- Die Erkennung der Netzbetreiber wurde verbessert, siehe [Issue #1](https://github.com/NerdTech-one/Senderkataster-Modder/issues/1). Danke an [Gabriel Huber/Yepoleb](https://github.com/Yepoleb) für den Hinweis.
- Als Nebeneffekt der verbesserten Erkennung werden nun die Sendeleistungen auf zwei Nachkommastellen genau angegeben.
- Weitere Darstellungsoptimierungen.

## Version 1.3.1
- Verbessert die Darstellung des Adresseingabefeldes.
- Wenn alle drei Netzbetreiber auf einem Sendemasten sind, wurde bei manchen Fenstergrößen der Text unter der Liste nicht an der richtigen Position dargestellt.

## Version 1.3.2
- Verbessert die Darstellung der Suchergebnisse des Adresseingabefeldes.
- Mapping für GSM, 5G wurde hinzugefügt.