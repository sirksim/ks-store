# KS · Gestion commerciale

Vitrine publique et gestion installable sur téléphone. Les données communes résident dans Cloudflare D1 et les photos dans R2. Le catalogue démarre vide avec une marge par défaut de 30 % et un pas de prix de 25 G.

## Développement local

Installer Node.js 24.15 ou plus récent, puis :

```sh
npm ci
npm run db:local:init
npm run dev
```

Ouvrir `http://localhost:8788/` pour la vitrine et `http://localhost:8788/admin/` pour la gestion. `npm run dev` construit `dist/` puis démarre Cloudflare Pages en local avec les liaisons `DB` et `IMAGES` déclarées dans `wrangler.toml`. La base et les images locales sont conservées dans `.wrangler/state/`. La commande `db:local:init` applique le schéma de façon répétable ; elle ne supprime pas les données existantes. La variable `ALLOW_LOCAL_AUTH` donne accès à la gestion uniquement sur `localhost` et `127.0.0.1` pendant ce développement local. [Documentation Pages locale](https://developers.cloudflare.com/pages/functions/local-development/) et [D1 locale](https://developers.cloudflare.com/d1/best-practices/local-development/).

## Cloudflare Pages

`npm run build` produit `dist/`, dont le Worker Pages. Pour un déploiement Git Pages, choisir **Build command** `npm run build` et **Build output directory** `dist`. `.node-version` fixe Node.js 24.15.0. Le fichier `wrangler.toml` sert au développement local ; il ne contient pas de répertoire de déploiement Pages. Configurer les liaisons et variables de production dans le tableau de bord Pages.

1. Créer une base D1, puis appliquer `migrations/0001_initial.sql` avec la console SQL D1 ou `npx wrangler d1 execute <nom-de-la-base> --remote --file=migrations/0001_initial.sql` avec une configuration de production appropriée.
2. Créer un bucket R2. Dans Pages, lier la base sous **`DB`** et le bucket sous **`IMAGES`**. Configurer aussi les liaisons de prévisualisation si elles sont nécessaires.
3. Protéger `ks.sirksim.xyz/admin/*` par Cloudflare Access. Ajouter dans Pages **`ACCESS_TEAM_DOMAIN`** et **`ACCESS_AUD`** correspondant à l’application Access. Sans ces variables, les routes de gestion refusent l’accès.
4. Associer le domaine public à Pages, puis vérifier la vitrine, la gestion, une publication de produit et une image.

Seules les variantes marquées **Publier cette variante sur la vitrine** sont visibles. Le catalogue public ne transmet ni prix, ni coût, ni quantité, ni facture, ni contact. Les données déjà présentes dans D1 restent en place pendant ce nettoyage.

## Données et sauvegardes

Les modifications hors connexion restent dans le navigateur et se synchronisent à la reconnexion. Si deux appareils modifient le même élément, la gestion demande de choisir une version. Dans **Rapports**, télécharger régulièrement une sauvegarde JSON. Seul le format JSON courant peut être restauré. **Réinitialiser les données** remplace les données communes par un catalogue vide et les paramètres par défaut. Les rapports peuvent aussi être exportés en CSV UTF-8 à séparateur point-virgule.

Les fichiers de travail et les trois fichiers SQLite conservés avant ce nettoyage se trouvent dans `.local-archive/`, exclu de Git. Les anciennes données du navigateur ne sont pas reprises sous les nouvelles clés KS.

## Vérification

```sh
npm test
npm run build
```
