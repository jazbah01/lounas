# Lounaat tänään

Kevyt omaan käyttöön tehty Node-sovellus, joka hakee Tampereen lähialueen lounaslistat ja näyttää kunkin ravintolan tuloksen erillisenä korttina.

## Käynnistys

```bash
npm start
```

Sovellus käynnistyy osoitteeseen [http://127.0.0.1:3000](http://127.0.0.1:3000).

## Ravintoloiden muokkaus

Lisää tai poista ravintoloita tiedostosta `/Users/janne.puistovirta/hamk/lounas/config/restaurants.mjs`.

Jokaisella ravintolalla on:

- `id`
- `name`
- `url`
- `parser`

Jos lisäät kokonaan uuden sivulähteen, sille pitää lisätä myös parseri tiedostoon `/Users/janne.puistovirta/hamk/lounas/lib/lunch-service.mjs`.

## Huomioita

- Haku tehdään vain arkipäivinä.
- Yhden ravintolan virhe ei estä muiden näyttämistä.
- Kaikki toteutus on ilman ulkoisia npm-riippuvuuksia.
