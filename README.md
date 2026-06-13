# Reservations casque VR

Petit site pour gerer les reservations de casques VR pendant une soiree.

## Fonctionnalites

- Page publique: reservation simple avec prenom, nom et choix du creneau.
- Page admin: modification du titre, du lieu, des casques, des creneaux et des reservations.
- Serveur local partage: les telephones et tablettes connectes au meme Wi-Fi voient les memes donnees.
- Stockage dans `data/reservations.json`.

## Lancer le site

```bash
node server.js
```

Puis ouvre:

- Site public: `http://localhost:3000`
- Admin: `http://localhost:3000/admin`
- Si tu ouvres les fichiers sans serveur: `public/index.html`

Il n'y a pas de code admin par defaut. Au premier lancement, ouvre `/admin`
et cree ton propre code admin.

Tu peux aussi imposer un code admin avec une variable d'environnement:

```bash
ADMIN_PASSWORD=ton-code node server.js
```

Sur Windows PowerShell:

```powershell
$env:ADMIN_PASSWORD="ton-code"; node server.js
```

## Connecter les appareils pendant la soiree

1. Lance le serveur sur un ordinateur connecte au meme Wi-Fi que les invites.
2. Le terminal affiche une adresse du style `http://192.168.x.x:3000`.
3. Ouvre cette adresse sur les telephones, tablettes ou ordinateurs des participants.
4. Garde le serveur ouvert pendant la soiree.

## Publication

Le depot GitHub contient le site et le serveur. GitHub Pages peut afficher les fichiers statiques, mais il ne suffit pas pour partager les reservations entre plusieurs appareils, car il ne lance pas de serveur Node. Pour une version en ligne accessible partout, deploie ce depot sur un hebergeur Node comme Render, Railway, Fly.io ou un VPS, puis configure `ADMIN_PASSWORD`.

Si le site est affiche ailleurs que sur le meme serveur Node, connecte-le avec:

```text
https://ton-site.example/?api=https://ton-serveur.example
```
