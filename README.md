# La Clé — sajt + admin (Supabase)

## Šta je u paketu

| Fajl | Čemu služi |
|---|---|
| `index.html`, `home.js` | Početna: destinacije i "Unlock" prozor sa vilama iz baze |
| `villa.html` | Automatska stranica za svaku vilu (`villa.html?id=...`) |
| `admin.html` | Admin: vile, destinacije, upiti, chat |
| `common.js` | Nalozi (sign in / create account), forma za upit, chat |
| `config.js` | **Ovde ubaciš Supabase URL i ključ** |
| `schema.sql` | Tabele + bezbednosna pravila (pokreće se jednom) |
| `style.css`, `img/` | Izgled i slike |

## Podešavanje (oko 10 minuta)

1. Napravi besplatan nalog na **supabase.com** → **New project** (zapamti lozinku baze).
2. Otvori **SQL Editor** → **New query** → nalepi ceo `schema.sql` → **Run**.
   (Ako pri kraju prijavi da je tabela "already member of publication", ignoriši.)
3. **Project Settings → API**: kopiraj **Project URL** i **anon public** ključ u `config.js`.
   Nikad ne stavljaj `service_role` ključ u sajt.
4. **Authentication → URL Configuration**:
   - *Site URL* = adresa sajta, npr. `https://ristihosting.github.io/La-Cle/`
   - Dodaj istu adresu u *Redirect URLs*.
5. **Authentication → Providers → Email**: dok testiraš možeš da isključiš
   "Confirm email" (da ne čekaš mejl). Za produkciju ga uključi.
6. Otvori sajt, klikni **Sign in → Create an account** i napravi svoj nalog.
7. U **SQL Editor** pokreni (sa svojim mejlom) da postaneš admin:
   ```sql
   update public.profiles set is_admin = true where email = 'tvoj@mejl.com';
   ```
8. Otvori `/admin.html` i prijavi se.
9. Postavi sve fajlove na GitHub (repo `La-Cle`), zajedno sa folderom `img/`.

## Kako se koristi admin

- **Villas → Add villa**: destinacija, ime, lokacija, opis, cena, slike
  (prva slika je naslovna; strelice menjaju redosled). Čim sačuvaš, vila se pojavljuje
  u "Unlock" prozoru i dobija svoju stranicu. Kvačica "Live" je skriva bez brisanja.
- **Destinations → Add destination**: nova destinacija (npr. Greece) odmah dobija
  pločicu na početnoj. Destinaciju sa vilama ne možeš da obrišeš dok ih ne premestiš.
- **Inquiries**: svaki upit sa sajta; menjaj status (New / Contacted / Closed),
  odgovori mejlom ili preko WhatsApp-a.
- **Chat**: razgovori sa klijentima u realnom vremenu. Klijent mora da se prijavi da bi pisao.

## Bezbednost (ukratko)

- `anon` ključ je javan po dizajnu; podatke štite RLS pravila iz `schema.sql`.
- Samo nalog sa `is_admin = true` može da menja vile, destinacije, upite i da šalje
  odgovore u chatu. Korisnik ne može sam sebi da postavi `is_admin`.
- Upite može da pošalje bilo ko, ali ih čita samo admin (i vlasnik upita ako je prijavljen).
- Forma za upit ima skriveno "honeypot" polje protiv botova. Za jaču zaštitu kasnije
  dodaj Cloudflare Turnstile.

## Obaveštenje mejlom o novom upitu (opciono, kasnije)

Sada upite vidiš u adminu (uz zvučni toast dok je admin otvoren). Da dobijaš i mejl:
Supabase → **Database → Webhooks** na tabelu `inquiries` (INSERT) + Edge Function
koja šalje mejl preko Resend-a. Mogu da napišem i to.

## Napomene

- Sajt nije testiran uživo sa tvojim projektom; prvu probu radimo zajedno.
- Dok `config.js` nije popunjen, sajt radi u demo režimu (WhatsApp umesto forme,
  bez naloga i chata).
- Imena vila u demo režimu su samo primer; prave unosiš u adminu.
