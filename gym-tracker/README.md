# Gym Tracker (application Android indépendante)

Application Android installée sur le téléphone, **sans serveur** et sans Chrome : thème sombre, plein écran, utilisable hors ligne.

- **Séances** : exercices, séries, répétitions et **poids par exercice** (dernière séance, record, note par exercice), calories brûlées estimées.
- **Repas** : journal par repas, calories et macros, **scan de code-barres** (Open Food Facts), recherche, aliments perso.
- **Poids** : pesées, courbe, objectif.
- **Accueil** : calories restantes, calendrier des séances, dernier poids.

## Où sont tes données ?

- Elles sont stockées **dans l'appli, sur le téléphone** (base locale). Rien n'est envoyé sur un serveur.
- **Dossier de données** (Réglages → *Choisir le dossier*) : tu choisis un dossier du téléphone (ex. `Documents/GymTracker`). À chaque modification, l'appli y copie un fichier `gym-tracker.json`. Il survit à une désinstallation ; en réinstallant, choisis le même dossier et l'appli propose de recharger le fichier.
- **Enregistrer une copie…** / **Restaurer une sauvegarde** : pour faire une copie ponctuelle ailleurs.
- Internet n'est utilisé que pour chercher un produit sur Open Food Facts. Un produit déjà scanné reste disponible hors ligne.

## Fabriquer l'APK

Je n'ai pas pu compiler l'APK moi-même (pas d'Android SDK dans mon environnement) : voici deux façons de le faire.

### Option A : Android Studio

1. Installe Android Studio (gratuit), puis **Open** → choisis le dossier `android` de ce projet.
2. Attends la synchronisation Gradle (elle télécharge les dépendances).
3. Menu **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
4. Android Studio indique où se trouve `app-debug.apk` (`android/app/build/outputs/apk/debug/`).

En ligne de commande (JDK 17 + Android SDK) : `cd android && ./gradlew assembleRelease` → `app/build/outputs/apk/release/app-release.apk`.

### Option B : GitHub (rien à installer)

1. Crée un dépôt GitHub (privé, c'est possible) et envoie-y tout ce dossier.
2. Onglet **Actions → Compiler l'APK → Run workflow**.
3. Quand c'est fini, télécharge l'artefact `gym-tracker-apk` : il contient l'APK.

## Installer

Copie l'APK sur le téléphone, ouvre-le et autorise l'installation depuis cette source (Android le demande). L'APK est signé avec la clé de debug : c'est parfait pour un usage personnel, mais il faudra garder la même clé pour les mises à jour.

## Scan de code-barres

Le scan utilise le scanner de Google (Google Play Services) : il faut un téléphone avec les services Google. Au premier usage, le module peut se télécharger (connexion nécessaire une fois). Sinon, tu peux taper le code à la main.

## Structure

- `public/` : l'interface (HTML/CSS/JS) et la base locale (`db.js`). Elle est embarquée dans l'appli.
- `android/` : la coquille Android (Kotlin) : WebView, scanner, accès au dossier.

Pour modifier l'interface : édite `public/`, puis recompile l'APK.

## Calories brûlées

`MET × poids × durée`. En musculation, durée = nombre de séries × 2,5 min (repos inclus, réglable). En cardio, la durée saisie. Le poids est ta dernière pesée. C'est une estimation.
