# Mise a Jour PROJECT_CONTEXT.md

Met a jour le changelog apres validation d'une feature complete.

## Actions a executer:

1. **Recuperer informations commit:**
   ```bash
   git log -1 --pretty=format:"%H %s %cd" --date=short
   ```

2. **Analyser changements:**
   ```bash
   git diff HEAD~1 HEAD --stat
   ```
   - Lister fichiers modifies
   - Identifier modules concernes (accounts, aquaculture, etc.)
   - Type de changement (Feature, Fix, Refactor, Docs, Tests)

3. **Lire PROJECT_CONTEXT.md actuel:**
   - Verifier derniere entree changelog
   - Respecter format chronologique existant

4. **Ajouter nouvelle entree:**
   Format obligatoire:
   ```markdown
   ### [YYYY-MM-DD] - Titre Feature
   **Type:** `Feature|Fix|Refactor` | **Module:** `accounts|aquaculture|both` | **Commit:** `hash-court`

   #### Added/Changed/Fixed
   - Description precise changements
   - Impact utilisateur si applicable
   - Fichiers cles modifies

   #### Tests
   - Tests unitaires ajoutes/modifies
   - Coverage maintenu >80%
   ```

5. **Mettre a jour statistiques si necessaire:**
   - Total lignes de code
   - Nombre fonctionnalites
   - Etat roadmap (cocher items completes)

6. **Verifications:**
   - Aucun accent dans texte (regle .md)
   - Ordre chronologique respecte
   - Liens vers commits corrects

**NB:** Ne pas creer entree si commit mineur (typo, formatting, etc.)

**Reference:** PROJECT_CONTEXT.md structure existante
