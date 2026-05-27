# LCE — Générateur de devis

Application web de génération de devis pour le cabinet **LCE Avocats Notaires**.

Outil monopage permettant de composer des devis intégrant honoraires, frais, vacations et droits d'enregistrement, avec export PDF et Word.

## Fonctionnalités

- **Composition de devis** par sélection dans un catalogue paramétrable (case à cocher → ajout automatique d'une ligne)
- **Tous les montants pré-remplis sont éditables manuellement** ligne par ligne
- **Calculateur intégré de droits d'enregistrement** :
  - Cession de fonds de commerce (barème progressif 0% / 3% / 5%)
  - Cession de parts sociales SARL (3% avec abattement proratisé)
  - Cession d'actions SAS/SA (0,1%)
  - Cession de parts SPI (5%)
  - Droit fixe (125 €)
- **Export PDF** (via fenêtre d'impression formatée) et **Word .docx**
- **Onglet paramètres** : cabinet, avocats signataires, catalogue prestations, catalogue frais — tout est éditable et persisté en local
- **Historique des devis** avec duplication, réouverture, suppression
- **Données 2024 du cabinet pré-chargées** (35+ prestations, 8 frais standards)

## Stack

- React 18 + Vite
- `docx` pour l'export Word
- `lucide-react` pour les icônes
- Persistance : `localStorage` (aucun backend nécessaire)

## Installation locale

```bash
npm install
npm run dev
```

L'app démarre sur `http://localhost:5173`.

```bash
npm run build       # build de production dans dist/
npm run preview     # prévisualiser le build
```

## Déploiement sur Vercel

### Méthode rapide (via GitHub)

1. **Pousser le code sur GitHub** :
   ```bash
   git init
   git add .
   git commit -m "Initial commit — LCE devis app"
   git branch -M main
   git remote add origin https://github.com/<ton-username>/lce-devis.git
   git push -u origin main
   ```

2. **Connecter à Vercel** :
   - Aller sur https://vercel.com → "Add New Project"
   - Importer le repo `lce-devis`
   - Vercel détecte automatiquement Vite → laisser les paramètres par défaut
   - Cliquer **Deploy**

3. Vercel te fournit une URL publique du type `https://lce-devis.vercel.app`. Chaque push sur `main` redéploie automatiquement.

### Méthode CLI (alternative)

```bash
npm install -g vercel
vercel
```

## Persistance des données

Les paramètres (cabinet, avocats, catalogues) et l'historique sont stockés dans le `localStorage` du navigateur de l'utilisateur. **Conséquences :**

- ✅ Aucun backend, hébergement gratuit
- ✅ Données 100% privées (jamais transmises)
- ⚠️ Données liées à l'utilisateur + navigateur (non partagées entre postes)
- ⚠️ Vider le cache navigateur efface les données

→ Pour partager les paramètres entre plusieurs avocats du cabinet ou centraliser l'historique, prévoir une migration vers Supabase (la structure du code est déjà prête : couche `storage` à 10 lignes à remplacer).

## Structure du projet

```
lce-devis/
├── index.html
├── package.json
├── vite.config.js
├── vercel.json
├── public/
│   └── favicon.svg
└── src/
    ├── main.jsx          # Point d'entrée React
    ├── App.jsx           # Application complète (1 seul fichier)
    └── index.css         # Styles globaux
```

Tout est concentré dans `App.jsx` :
- Données par défaut (DEFAULT_*) → tarifs LCE 2024
- Onglets : `DevisTab`, `DroitsTab`, `ParametresTab`, `HistoriqueTab`
- Calculateurs : `calcCessionFondsCommerce`, `calcCessionParts`, etc.
- Exports : `exportWord` (via lib `docx`), `exportPDF` (via fenêtre d'impression)

## Personnalisation

### Modifier les tarifs par défaut

Aller dans `src/App.jsx`, sections `DEFAULT_PRESTATIONS` et `DEFAULT_FRAIS_DIVERS`. Ces données ne sont chargées qu'au premier lancement, ensuite les paramètres modifiés via l'interface sont persistés dans le localStorage.

Pour réinitialiser à zéro : vider le localStorage du navigateur sur le domaine de l'app.

### Logo

Le logo s'importe via l'onglet **Paramètres → Cabinet → Logo**. Il est stocké en base64 dans le localStorage et apparaît automatiquement dans les exports PDF/Word.

## Licence

Usage interne LCE Avocats Notaires.
