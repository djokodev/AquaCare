# DESIGN_SYSTEM.md

Reference rapide des valeurs de design. Import depuis `constants/colors.ts`.

## Couleurs

### Primaires
| Nom | Hex | Usage |
|-----|-----|-------|
| GREEN_PRIMARY | `#059669` | Boutons, headers, icones principales |
| GREEN_LIGHT | `#10b981` | Hover, accents |
| GREEN_DARK | `#047857` | Emphasis, borders actifs |

### Neutres
| Nom | Hex | Usage |
|-----|-----|-------|
| WHITE | `#ffffff` | Cards, modales |
| CREAM | `#f8fafc` | Background app |
| GRAY_DARK | `#1e293b` | Texte principal |
| GRAY_LIGHT | `#64748b` | Texte secondaire, placeholders |

### Semantiques
| Nom | Hex | Usage |
|-----|-----|-------|
| SUCCESS | `#059669` | Confirmations (= GREEN_PRIMARY) |
| WARNING | `#f59e0b` | Alertes, FCR > 2.0 |
| ERROR | `#dc2626` | Erreurs, mortalite > 40% |
| INFO | `#0ea5e9` | Tooltips, infos |

## Typographie

```typescript
h1:    { fontSize: 32, fontWeight: 'bold' }
h2:    { fontSize: 24, fontWeight: 'bold' }
h3:    { fontSize: 20, fontWeight: 'bold' }
h4:    { fontSize: 18, fontWeight: '600' }
body:  { fontSize: 16 }
small: { fontSize: 14 }
caption: { fontSize: 12, color: GRAY_LIGHT }
```

## Espacements

Base 4px : `4, 8, 12, 16, 20, 24, 32, 40, 48`

```typescript
padding: 16        // Standard cards
marginBottom: 12   // Entre elements
borderRadius: 12   // Cards, boutons
borderRadius: 8    // Inputs
```

## Ombres

```typescript
// Subtle (cards)
shadow_sm: {
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.1,
  shadowRadius: 2,
  elevation: 2
}

// Standard (boutons)
shadow_md: {
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.1,
  shadowRadius: 3,
  elevation: 3
}

// Emphasize (modales)
shadow_lg: {
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.15,
  shadowRadius: 6,
  elevation: 6
}
```

## Contraintes

- **Zone tactile minimum** : 44x44 px (Apple HIG)
- **Contraste texte** : 4.5:1 minimum (WCAG AA)
- **Contraste actuel** : Blanc sur vert = 21:1 (AAA)

## Composants recurrents

### Bouton primaire
```typescript
{
  backgroundColor: GREEN_PRIMARY,
  paddingVertical: 16,
  paddingHorizontal: 24,
  borderRadius: 12,
  alignItems: 'center'
}
```

### Card standard
```typescript
{
  backgroundColor: WHITE,
  borderRadius: 12,
  padding: 16,
  marginBottom: 12,
  ...shadow_md
}
```

### Input
```typescript
{
  backgroundColor: WHITE,
  borderWidth: 1,
  borderColor: GRAY_LIGHT,  // GREEN_PRIMARY si focus, ERROR si erreur
  borderRadius: 8,
  paddingVertical: 12,
  paddingHorizontal: 16
}
```

### Badge notification
```typescript
{
  position: 'absolute',
  top: -8,
  right: -8,
  backgroundColor: ERROR,
  borderRadius: 12,
  minWidth: 20,
  paddingHorizontal: 6
}
```

## Icones

Librairie : `@expo/vector-icons/Ionicons`

Tailles : 20 (inline), 24 (standard), 32 (stat cards), 48 (empty states)

## Animations

```typescript
// Toujours useNativeDriver: true pour 60fps
Animated.timing(fadeAnim, {
  toValue: 1,
  duration: 300,
  useNativeDriver: true
})
```

Durees : 150ms (micro), 300ms (standard), 500ms (majeur)

## Checklist nouveau screen

- [ ] Couleurs actuelles (pas de vert invente)
- [ ] Zones tactiles 44x44
- [ ] Etats : vide, loading, erreur
- [ ] Pull-to-refresh si donnees dynamiques
- [ ] Traductions t('key')
