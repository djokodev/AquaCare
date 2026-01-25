# Check Package Compatibility

Verify package compatibility and maturity before installation.

**Usage:** `/check-package <package-name>`

---

## Workflow

### Step 1: Identify Package Type

Determine if the package is for:
- **Frontend** (React Native/Expo) → Requires Expo Go compatibility check
- **Backend** (Python/Django) → Requires Python version compatibility check

---

### Step 2: Frontend Package Verification (CRITICAL)

#### 2.1 Expo Go Compatibility Check

Use Context7 MCP to fetch documentation:
```
Query: "Is <package-name> compatible with Expo Go?"
```

Then verify manually:
1. Check https://reactnative.directory/ for "Expo Go" tag
2. Check https://docs.expo.dev/versions/latest/ for official support
3. Check if package requires native code (`react-native link` = NOT compatible)

#### 2.2 Known Expo Alternatives

| Native Package | Expo Alternative |
|----------------|------------------|
| `react-native-camera` | `expo-camera` |
| `react-native-image-picker` | `expo-image-picker` |
| `react-native-fs` | `expo-file-system` |
| `react-native-video` | `expo-av` |
| `react-native-maps` | `react-native-maps` (Expo compatible) |
| `react-native-permissions` | `expo-permissions` |
| `react-native-device-info` | `expo-device` |
| `react-native-share` | `expo-sharing` |
| `react-native-svg` | `react-native-svg` (Expo compatible) |
| `react-native-webview` | `react-native-webview` (Expo compatible) |

#### 2.3 Maturity Check

Using Context7 or GitHub:
- [ ] Last commit < 6 months ago
- [ ] Stars > 500 (or official Expo package)
- [ ] Open issues ratio reasonable
- [ ] TypeScript support
- [ ] Active maintainer responses

---

### Step 3: Backend Package Verification

1. Check PyPI for package info
2. Verify Python 3.10+ compatibility
3. Check Django 5.x compatibility if Django-related
4. Review dependencies for conflicts

---

### Step 4: Decision Matrix

| Condition | Action |
|-----------|--------|
| Expo Go compatible + mature | ✅ INSTALL |
| Expo Go compatible + immature | ⚠️ WARN user, suggest alternatives |
| NOT Expo Go compatible | ❌ BLOCK - suggest alternative |
| Native code required | ❌ BLOCK - requires EAS Build |

---

### Step 5: Installation Commands

**Frontend (ALWAYS use npx expo install):**
```bash
cd frontend
npx expo install <package-name>
```

**Backend:**
```bash
cd backend
pip install <package-name>
pip freeze | grep <package-name> >> requirements.txt
```

---

## Output Format

```
PACKAGE ANALYSIS: <package-name>
================================

Type: Frontend | Backend
Expo Go Compatible: YES | NO | N/A
Maturity Score: HIGH | MEDIUM | LOW

Checks:
[✓] Active maintenance (last commit: <date>)
[✓] TypeScript support
[✓] Documentation quality
[✗] Requires native code

VERDICT: ✅ SAFE TO INSTALL | ⚠️ INSTALL WITH CAUTION | ❌ DO NOT INSTALL

Alternative: <alternative-package> (if applicable)

Installation:
npx expo install <package-name>
```

---

## Rules

1. **NEVER** use `npm install` for React Native packages
2. **ALWAYS** use `npx expo install` for frontend packages
3. **BLOCK** any package requiring native code (breaks Expo Go)
4. **PREFER** official Expo packages over community alternatives
5. **CHECK** existing package.json to avoid duplicates

---

## References

- CLAUDE.md: Expo Go constraints
- DONT_DO.md: Forbidden packages list
- https://reactnative.directory/
- https://docs.expo.dev/
