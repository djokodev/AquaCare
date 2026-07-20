# Magasin et recommandations alimentaires

## Identité des aliments

`FarmFeedReference` identifie un aliment dans une ferme. Une référence peut provenir du catalogue AquaCare ou être externe. Une référence externe est utilisable pour le stock et les rations, mais n'est jamais ajoutée au catalogue Commerce. La compatibilité automatique exige la même espèce et la même granulométrie.

Les nouvelles déclarations de stock et les nouvelles rations alimentaires exigent une référence. Les anciens stocks et journaux ambigus restent non classifiés jusqu'à une décision humaine.

## Stock physique et classification historique

Le stock disponible est la somme des entrées de stock moins les consommations enregistrées depuis leur suivi. Classifier une ancienne entrée change son identité, pas sa quantité physique. Lorsque des consommations historiques correspondent sans ambiguïté à cette entrée, un ajustement persistant conserve le disponible antérieur à la classification.

La migration `0038_farm_feed_references` ne classifie automatiquement que les entrées issues d'une commande dont les snapshots, le cycle et la ferme sont cohérents. Les entrées manuelles et les anciens journaux fondés uniquement sur un nom et une granulométrie restent non classifiés. La migration additive `0040_cycle_feed_stock_adjustment` installe le ledger de classification et remplace la contrainte d'identité initiale ; elle fonctionne aussi sur une base de revue ayant déjà appliqué `0038`. Le forward est non destructif. Lors d'un rollback, les champs, contraintes et tables ajoutés sont supprimés par les opérations inverses de Django ; les snapshots historiques d'origine ne sont jamais réécrits.

## Plan et recalcul

Le lancement d'un nouveau cycle crée un `CycleFeedPlan` persistant. Il conserve les paramètres, les phases et le total en kilogrammes de la simulation initiale. Les cycles plus anciens utilisent un backfill paresseux idempotent marqué `legacy_backfill`.

Le recalcul courant conserve les phases passées et répartit chronologiquement les consommations, le stock compatible et les commandes encore à recevoir. Les besoins futurs utilisent le poids et l'effectif actuels. Si le poids cible, le poids courant, la date ou d'autres paramètres indispensables manquent, le statut est `unavailable` et aucune quantité n'est proposée.

Les propositions commerciales utilisent uniquement le poids réel du conditionnement snapshot ou catalogue. Aucune équivalence avec un sac standard n'est utilisée.

## Synchronisation hors ligne

Les commandes locales possèdent un `client_uuid` stable et une empreinte de payload. La synchronisation respecte cet ordre :

1. références d'aliments ;
2. déclarations de stock ;
3. journaux quotidiens qui consomment ce stock.

Après la création serveur d'une référence, son `server_id` est conservé localement. Une coupure pendant le stock reprend donc à cette étape sans recréer la référence. Les journaux dépendants restent en attente tant que leur stock n'est pas accepté. Un replay identique retourne l'objet existant ; un même `client_uuid` avec un autre payload produit un conflit explicite.

Le Magasin projette les déclarations locales dans le stock visible et les marque comme en attente de synchronisation. Cet état force un calcul `incomplete` : l'interface ne prétend pas que le serveur est à jour et n'affiche pas « Besoin couvert ».
