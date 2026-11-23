# Karta bajki (formularz)

Formularz dla rodzica: dane dzieci do spersonalizowanej bajki i zgody. Czysty HTML, CSS i JS,
bez bibliotek, czcionek z sieci, analityki i cookies. Odpowiedzi idą jednym żądaniem POST (JSON)
do webhooka n8n, który dopisuje wiersz do arkusza Google.

Pliki:

- `index.html`: struktura formularza i ekranu potwierdzenia,
- `style.css`: wygląd (mobile first) i osobny styl wydruku `@media print` dla kopii PDF,
- `script.js`: logika, walidacja i wysyłka; na samej górze stałe `WEBHOOK_URL` i `SEKRET`,
- `config.js`: teksty zgód, `RETENTION_TEXT`, `CONSENT_VERSION` i `CONTACT`.

## Konfiguracja (tylko lokalnie)

1. W `script.js` wpisz w miejsce `TU_WSTAW_URL` Production URL webhooka z n8n,
   a w miejsce `TU_WSTAW_SEKRET` nowy sekret, ten sam co w node "Sekret poprawny?" w n8n.
2. W `config.js` wpisz w miejsce `TU_WSTAW_KONTAKT` kontakt administratora danych
   (np. adres e-mail), pokazywany w rozwijanej informacji o danych.

Uwaga: sekret w stronie statycznej jest widoczny dla każdego, kto otworzy źródło strony.
Chroni tylko przed przypadkowymi wywołaniami. Główną ochroną są: osobny webhook tylko dla tej karty,
Allowed Origins ustawione na domenę GitHub Pages i walidacja po stronie n8n.

## Zmiana treści zgód

Każda zmiana tekstu w `config.js` zmienia `consent_hash`. Wtedy:

1. ustaw nową wartość `CONSENT_VERSION` (np. `v2-RRRR-MM-DD`),
2. w workflow n8n, w node "Walidacja pól", zaktualizuj `EXPECTED_VERSION` i `EXPECTED_HASH`
   (hash policzysz w konsoli przeglądarki na stronie formularza:
   `await sha256Hex(CONSENT_TEXT_1 + CONSENT_TEXT_2 + WITHDRAWAL_TEXT + RETENTION_TEXT)`).

Inaczej n8n odrzuci kartę z kodem 400.

## Uruchomienie lokalne i testy

W tym folderze:

```bash
python -m http.server 8000 --bind 127.0.0.1
```

Potem otwórz:

- http://127.0.0.1:8000/?mock=1 : tryb testowy, nic nie jest wysyłane, po chwili pojawia się ekran potwierdzenia,
- http://127.0.0.1:8000/?mock=blad : pierwsza próba wysłania kończy się symulowanym błędem sieci
  (sprawdzisz komunikat i przycisk "Spróbuj ponownie"), druga się udaje,
- http://127.0.0.1:8000/?mock=1&k=TEST01 : z kodem rodziny.

W trybie testowym w konsoli przeglądarki widać, co poszłoby do webhooka (sekret ukryty).

Co sprawdzić: wymagane pola (imię, wiek 0 do 17, zgoda wymagana, potwierdzenie rodzica, imię
i nazwisko rodzica), dodawanie i usuwanie dzieci (od 1 do 5), ekran potwierdzenia i "Zapisz kopię (PDF)".

## Link dla rodzica

`https://TWOJ_LOGIN.github.io/NAZWA_REPO/?k=KOD`

`KOD` to neutralny kod rodziny (litery, cyfry, `-` i `_`, do 40 znaków), np. `R2611A`.
Nigdy nie wpisuj w link imion ani nazwisk. Formularz nie zapisuje danych w przeglądarce
(localStorage, sessionStorage, cookies) ani w adresie strony.

## Wdrożenie (etap B)

Do publicznego repo idzie tylko ten folder (`karta-bajki-formularz`). Folder `karta-bajki-n8n`
nigdy nie trafia do publicznego repo.

1. Utwórz publiczne repo na GitHubie i wgraj do niego zawartość tego folderu.
2. Settings → Pages → Deploy from a branch → gałąź `main`, folder `/ (root)`.
3. Przed wypchnięciem sprawdź, że w `script.js` są właściwe wartości i że nie ma w repo innych plików.
4. W n8n ustaw w node Webhook Allowed Origins na `https://TWOJ_LOGIN.github.io`.
5. Zrób jedną próbę z prawdziwym webhookiem na fikcyjnych danych i usuń ten wiersz z arkusza.
