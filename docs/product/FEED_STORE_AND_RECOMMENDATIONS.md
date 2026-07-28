# Magasin et recommandations alimentaires

## Identité des aliments

`FarmFeedReference` identifie un aliment dans une ferme. Une référence peut provenir du catalogue AquaCare ou être externe. Une référence externe est utilisable pour le stock et les rations, mais n'est jamais ajoutée au catalogue Commerce. La compatibilité automatique exige la même espèce et la même granulométrie.

Les nouvelles déclarations de stock et les nouvelles rations alimentaires exigent une référence. Les anciens stocks et journaux ambigus restent non classifiés jusqu'à une décision humaine.

## Stock physique et classification historique

Le stock disponible provient d'un registre chronologique unique. Une entrée devient disponible au début de sa date métier, puis les ajustements historiques et les rations du jour sont appliqués dans un ordre déterministe. Une entrée future ne peut donc jamais financer une ration passée. Une saisie rétroactive est refusée si elle rend négatif le stock à sa date ou à une date ultérieure.

Classifier une ancienne entrée change son identité, pas sa quantité physique. Les consommations historiques sont affectées en FIFO aux entrées de même ferme, espèce, nom normalisé et granulométrie, sans jamais consommer un stock entré plus tard. Un ajustement persistant conserve exactement le disponible antérieur à la classification.

La migration `0038_farm_feed_references` ne classifie automatiquement que les entrées issues d'une commande dont les snapshots, le cycle et la ferme sont cohérents. Les entrées manuelles et les anciens journaux fondés uniquement sur un nom et une granulométrie restent non classifiés. La migration additive `0040_cycle_feed_stock_adjustment` installe les ajustements de classification. `0041` est volontairement conservatrice : l'absence de `client_uuid` n'est jamais considérée comme une preuve d'association heuristique. `0043_safe_legacy_feed_classification_repair` restaure uniquement les liens uniques dont la provenance est prouvée par les métadonnées de création ou de synchronisation. Quantités, coûts, dates et snapshots historiques ne sont jamais réécrits.

## Plan et recalcul

Le lancement d'un nouveau cycle crée un `CycleFeedPlan` persistant. Il conserve les paramètres, les phases et le total en kilogrammes de la simulation initiale. Les cycles plus anciens utilisent un backfill paresseux idempotent marqué `legacy_backfill`.

La phase maximale atteinte est persistée au moment des mutations métier, notamment après une pesée dans le journal quotidien et après le recalcul des métriques du cycle. Elle est monotone : une mesure plus faible ultérieure ne fait jamais revenir le plan en arrière. La migration `0044_backfill_cycle_feed_phase_progression` initialise les plans existants depuis le maximum des poids historiques connus sans réécrire leurs snapshots.

Le recalcul courant conserve les phases passées et répartit chronologiquement les consommations, le stock compatible et les commandes encore à recevoir. Les besoins futurs utilisent le poids et l'effectif actuels. Si le poids cible, le poids courant, la date ou d'autres paramètres indispensables manquent, le statut est `unavailable` et aucune quantité n'est proposée.

Les propositions commerciales utilisent uniquement le poids réel du conditionnement snapshot ou catalogue. Aucune équivalence avec un sac standard n'est utilisée.

## Synchronisation hors ligne

Les commandes locales possèdent un `client_uuid` stable et une empreinte de payload. La synchronisation respecte cet ordre :

1. références d'aliments ;
2. déclarations de stock ;
3. journaux quotidiens qui consomment ce stock.

Après la création serveur d'une référence, son `server_id` est conservé localement. Une coupure pendant le stock reprend donc à cette étape sans recréer la référence. Les journaux dépendants restent en attente tant que leur stock n'est pas accepté. Un replay identique retourne l'objet existant ; un même `client_uuid` avec un autre payload produit un conflit explicite.

Le Magasin projette les déclarations locales dans le stock visible et les marque comme en attente de synchronisation. Les références locales résolues vers un identifiant serveur sont regroupées avant tout calcul, puis chaque journal local est déduit une seule fois. Une projection négative est conservée et signalée comme conflit au lieu d'être masquée.

Une saisie journalière locale non synchronisée est retrouvée par cycle, date et unité de production. Elle rouvre le formulaire avec son `client_uuid`, peut être modifiée sur place et remplace la copie locale précédente. Si le serveur et le téléphone possèdent deux saisies différentes pour le même périmètre, l'interface bloque la sauvegarde et demande une résolution explicite.

Tout état local force un calcul `incomplete` : l'interface ne prétend pas que le serveur est à jour et n'affiche pas « Besoin couvert ».
