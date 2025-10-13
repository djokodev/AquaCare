# Verification Package avec Context7

Verifie compatibilite et maturite d'un package avant installation.

## Actions a executer:

1. **Verification Expo (CRITIQUE pour frontend):**
   - Consulter https://reactnative.directory/
   - Chercher tag "Expo Go compatible"
   - Verifier presence dans https://docs.expo.dev/versions/latest/

2. **Recherche Context7:**
   - Utiliser Context7 pour consulter documentation officielle
   - Verifier maturite du package:
     - Maintenance active (dernier commit < 6 mois)
     - Nombre stars GitHub
     - Issues ouvertes vs fermees
     - Qualite documentation

3. **Alternatives Expo-first:**
   - Si package non-Expo, chercher alternative officielle:
     - `react-native-camera` ’ `expo-camera`
     - `react-native-maps` ’ `react-native-maps` (Expo compatible)
     - `react-native-image-picker` ’ `expo-image-picker`

4. **Decision:**
   -  Installer si Expo-compatible + mature
   - L Bloquer si non-Expo (sauf validation utilisateur)
   -   Proposer alternative si disponible

5. **Installation conforme:**
   ```bash
   # Frontend
   cd frontend
   expo install nom-du-package

   # Backend
   cd backend
   source venv/bin/activate  # ou venv\Scripts\activate (Windows)
   pip install nom-du-package
   pip freeze > requirements.txt
   ```

**INTERDICTION ABSOLUE:** `npm install` pour packages React Native
**OBLIGATOIRE:** `expo install` uniquement

**Reference:** CLAUDE.md ligne 63-93, DONT_DO.md ligne 31-68
