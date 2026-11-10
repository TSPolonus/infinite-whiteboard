# 🎨 InfinityDraw — Nieskończona Tablica do Rysowania

Nowoczesna aplikacja do rysowania z **nieskończoną przestrzenią roboczą (infinite canvas)**, działająca w przeglądarce oraz jako aplikacja na **Androidzie, iOS i HyperOS (Xiaomi)**.

![InfinityDraw Preview](./public/icon.svg)

---

## ✨ Kluczowe Funkcje

1. **Nieskończona tablica (Infinite Canvas)**
   - Płynne przesuwanie tablicy (pan) oraz przybliżanie/oddalanie (zoom od 15% do 500%).
   - Obsługa gestów dotykowych na telefonach i tabletach (szczypanie dwoma palcami do zoomu, przesuwanie).
   - Inteligentna siatka pomocnicza (kropki, kratka lub gładkie tło).

2. **Rysowanie i Narzędzia**
   - **Pióro (Pen)** — gładkie linie o regulowanej grubości i pełnej palecie barw.
   - **Zakreślacz (Highlighter)** — półprzezroczyste podkreślanie tekstu i szkiców.
   - **Gumka (Eraser)** — natychmiastowe usuwanie obiektów i linii.
   - **Wskaźnik laserowy (Laser Pointer)** — świecący, neonowy ślad, który automatycznie znika po chwili (idealny do prezentacji i wskazywania na żywo).
   - **Wstawianie zdjęć** — dodawanie grafik z dysku, aparatu, schowka (`Ctrl+V`) lub przeciągnij-i-upuść (Drag & Drop).

3. **🪄 Automatyczne Kształty (Auto-Shape Snap)**
   - Narysuj odręcznie figurę (np. trójkąt, koło, prostokąt, linię prostą, strzałkę).
   - **Przytrzymaj rysik / palec / kursor bez odrywania na końcu linii przez ~0.4 sekundy**.
   - Aplikacja automatycznie rozpozna figurę i zamieni ją w idealny kształt geometryczny!

4. **🔗 Dołączanie przez Link i Współpraca na Żywo**
   - Każda tablica ma swój unikalny identyfikator pokoju (w linku URL).
   - Przesyłanie pociągnięć pędzla, laserowych wskaźników i kursorów innych uczestników w czasie rzeczywistym dzięki WebRTC Peer-to-Peer.

5. **🔒 Status Tablicy (Publiczna / Dostęp za hasłem)**
   - **Publiczny** — każdy, kto otrzyma link, może dołączyć i rysować.
   - **Dostęp za hasłem** — właściciel ustala hasło; każda nowa osoba wchodząca z linku musi podać poprawne hasło, aby odblokować tablicę.

6. **📱 Działanie jako aplikacja (PWA) na Android, iOS i HyperOS**
   - **Android / HyperOS (Xiaomi):** Otwórz w Chrome / przeglądarce Mi Browser → Kliknij menu (3 kropki) → **"Zainstaluj aplikację"** lub **"Dodaj do ekranu głównego"**.
   - **iOS (iPhone / iPad):** Otwórz w Safari → Kliknij ikonę **Udostępnij** (kwadrat ze strzałką w górę) → **"Do ekranu początkowego"**.

7. **💾 Eksport i Zapis**
   - Zapisz jako obraz **PNG**.
   - Zapisz jako wektor **SVG**.
   - Pełna kopia projektu do pliku **JSON** (możliwość ponownego otwarcia w dowolnym momencie).

---

## 🚀 Jak uruchomić projekt lokalnie

1. Upewnij się, że masz zainstalowany [Node.js](https://nodejs.org/).
2. Otwórz folder w terminalu i wpisz:
   ```bash
   npm install
   npm run dev
   ```
3. Otwórz w przeglądarce wyświetlony adres (np. `http://localhost:5173`).

---

## 📤 Jak wstawić projekt na GitHub

### Sposób 1: Najprostszy — GitHub Desktop (zalecany dla początkujących)
1. Pobierz darmowy program [GitHub Desktop](https://desktop.github.com/) i zaloguj się swoim kontem GitHub.
2. W GitHub Desktop kliknij: **File** → **Add local repository...**
3. Wybierz folder: `c:\Users\adiku\Desktop\Aplikacja do rysowania`.
4. Jeśli pojawi się komunikat *"This directory does not appear to be a Git repository"*, kliknij **"create a repository"**.
5. Wpisz nazwę repozytorium (np. `infinity-draw`) i kliknij **Create Repository**.
6. Kliknij niebieski przycisk u góry: **Publish repository** (możesz odznaczyć *"Keep this code private"*, jeśli chcesz publiczne repozytorium).
7. Gotowe! Projekt jest na Twoim GitHubie.

---

### Sposób 2: Przez przeglądarkę (bez instalowania programów)
1. Wejdź na [GitHub.com](https://github.com/) i utwórz nowe repozytorium (przycisk **New**).
2. Nadaj nazwę, np. `infinity-draw`, i kliknij **Create repository**.
3. Na stronie nowego repozytorium kliknij link **"uploading an existing file"**.
4. Zaznacz wszystkie pliki z folderu aplikacji (oprócz folderu `node_modules` i `dist`) i przeciągnij je do okna przeglądarki.
5. Kliknij zielony przycisk **Commit changes**.

---

### Sposób 3: Przez wiersz poleceń (Git CLI)
1. Zainstaluj [Git for Windows](https://git-scm.com/download/win).
2. W terminalu w folderze projektu wpisz:
   ```bash
   git init
   git add .
   git commit -m "Pierwszy commit - InfinityDraw"
   git branch -M main
   git remote add origin https://github.com/TWOJA_NAZWA_UZYTKOWNIKA/NAZWA_REPOZYTORIUM.git
   git push -u origin main
   ```

---

## 🌐 Jak włączyć darmową stronę online (GitHub Pages)

W projekcie przygotowano już plik automatycznego wdrożenia (`.github/workflows/deploy.yml`):
1. Wejdź w swoje repozytorium na GitHubie.
2. Przejdź do zakładki **Settings** → **Pages** (w menu po lewej stronie).
3. W sekcji **Build and deployment** w polu **Source** zmień z *"Deploy from a branch"* na **GitHub Actions**.
4. Przejdź do zakładki **Actions** u góry i upewnij się, że workflow *Deploy InfinityDraw to GitHub Pages* zakończył się sukcesem.
5. Twoja aplikacja będzie dostępna pod adresem:
   `https://TWOJA_NAZWA_UZYTKOWNIKA.github.io/NAZWA_REPOZYTORIUM/`
6. Ten link możesz wysłać znajomym lub otworzyć na telefonie z Androidem, iOS i HyperOS!
