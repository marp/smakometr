# Smakometr
Proste rozszerzenie Firefox, które dodaje:

- pole notatki obok nazwy restauracji (zarówno na liście wyszukiwania,
  np. `pyszne.pl/na-dowoz/jedzenie/...`, jak i na stronie restauracji),
- pole notatki obok każdego dania na stronie restauracji,
- prosty system kolorystycznej oceny restauracji
  (czerwony / pomarańczowy / zielony) — kolor podświetla całą kartę
  restauracji na liście oraz nagłówek strony restauracji. Kolory mają
  warianty dla jasnego i ciemnego motywu (`prefers-color-scheme`).

Wszystko zapisywane jest lokalnie (`browser.storage.local`) i pozostaje
prywatne — nic nie jest wysyłane na zewnątrz.

## Instalacja (tryb deweloperski)

1. Otwórz Firefoxa i wpisz w pasku adresu: `about:debugging#/runtime/this-firefox`.
2. Kliknij **„Wczytaj tymczasowy dodatek…”**.
3. Wskaż plik `manifest.json` z tego katalogu.
4. Wejdź na dowolną stronę restauracji na pyszne.pl — obok nazwy restauracji
   i przy każdym daniu zobaczysz przycisk **„📝 Notatka”**.

> Tymczasowe dodatki znikają po zamknięciu Firefoxa. Aby zainstalować
> rozszerzenie na stałe, trzeba je podpisać w [AMO](https://addons.mozilla.org)
> albo użyć wydania Developer/Nightly z wyłączoną walidacją podpisów
> (`xpinstall.signatures.required = false`).

## Jak rozróżniane są restauracje i dania

- **Restauracja** — po fragmencie ścieżki URL `/menu/<slug>`. Slug jest
  trwałym identyfikatorem restauracji na pyszne.pl, więc notatka pozostaje
  przypisana do restauracji niezależnie od parametrów zapytania czy języka.
  Na stronach listingów (np. `/na-dowoz/jedzenie/...`) ten sam slug
  jest wyciągany z linków `<a href="/menu/...">` w kartach restauracji,
  więc notatki i oceny ustawione na liście są tymi samymi notatkami,
  które potem widać po wejściu w restaurację.
- **Danie** — po nazwie dania (po znormalizowaniu do małych liter)
  w obrębie danej restauracji. To kompromis: nazwy dań nie mają
  publicznego, stabilnego ID, ale są unikalne w menu jednej restauracji.
  Jeżeli restauracja zmieni nazwę dania, stara notatka pozostanie pod
  starą nazwą (widoczna w popupie rozszerzenia).
- **Ocena** — przypisywana do restauracji (nie do dań). Wartości:
  `red` (słaba), `orange` (średnia), `green` (dobra) lub brak.

## Popup rozszerzenia

Klikając ikonę rozszerzenia, otworzysz listę wszystkich notatek
pogrupowanych po restauracjach. Można w niej:

- przeszukiwać notatki,
- usuwać pojedyncze notatki,
- eksportować i importować całość jako JSON (kopia zapasowa).

## Struktura projektu

```
src/
  manifest.json
  icons/
    icon.svg
    icon-128.png
  content/
    content.js        # wstrzykiwanie widgetów na stronę
    widgets.js        # budowanie buttonów i toolbarów
    storage.js        # zapis/odczyt browser.storage.local
    content.css
    restaurant.css
    toolbar-card.html
    toolbar-restaurant.html
  popup/
    popup.html        # widok wszystkich notatek
    popup.js
    popup.css
```

## Prywatność

Rozszerzenie nie zbiera, nie przesyła ani nie udostępnia żadnych danych. Notatki i oceny są zapisywane wyłącznie lokalnie w przeglądarce (`browser.storage.local`) i nigdy nie opuszczają urządzenia. Brak analityki, telemetrii i jakichkolwiek zewnętrznych połączeń.

## Uwagi techniczne

- Selektory dopasowujące nazwę restauracji i karty dań są heurystyczne
  (kilka wariantów pod różne wersje frontendu pyszne.pl). Jeśli pyszne.pl
  zmieni layout i pola przestaną się pojawiać, najprościej jest dopisać
  nowy selektor w `RESTAURANT_NAME_SELECTORS` lub `DISH_CONTAINER_SELECTORS`
  w `content/content.js`.
- Treść strony jest renderowana dynamicznie, dlatego rozszerzenie używa
  `MutationObserver` i sprawdza zmiany URL co ~750 ms, by łapać nawigacje
  wewnątrz aplikacji.
