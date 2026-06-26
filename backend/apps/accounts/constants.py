"""
Constantes et choix pour l'application accounts.

Basées sur la recherche officielle des divisions administratives
et statuts juridiques du Cameroun en 2024.
"""

ACCOUNT_RATE_LIMIT_WINDOW_SECONDS = 60
ACCOUNT_RATE_LIMIT_RETRY_AFTER_SECONDS = 60
ACCOUNT_LOGIN_IP_LIMIT = 5
ACCOUNT_LOGIN_USER_LIMIT = 3
ACCOUNT_REGISTER_IP_LIMIT = 10

ACCOUNT_LOGIN_THROTTLE_RATE = "5/minute"
ACCOUNT_LOGIN_GLOBAL_THROTTLE_RATE = "10/second"
ACCOUNT_REGISTER_THROTTLE_RATE = "10/minute"
ACCOUNT_SENSITIVE_ACTION_THROTTLE_RATE = "20/hour"
ACCOUNT_TOKEN_THROTTLE_RATE = "30/minute"
ACCOUNT_FARM_SETUP_THROTTLE_RATE = "30/hour"
ACCOUNT_SIMULATION_THROTTLE_RATE = "60/hour"

ACCOUNT_ENDPOINT_RATE_LIMITS = {
    '/api/accounts/login/': {
        'ip_limit': ACCOUNT_LOGIN_IP_LIMIT,
        'window_seconds': ACCOUNT_RATE_LIMIT_WINDOW_SECONDS,
    },
    '/api/accounts/register/': {
        'ip_limit': ACCOUNT_REGISTER_IP_LIMIT,
        'window_seconds': ACCOUNT_RATE_LIMIT_WINDOW_SECONDS,
    },
}

# Types de compte
ACCOUNT_TYPE_CHOICES = [
    ('individual', 'Personne physique'),
    ('company', 'Entreprise'),
]

# Types d'activité aquacole (maillon d'activité)
ACTIVITY_TYPE_CHOICES = [
    ('alevins', 'Producteur d\'alevins'),
    ('poisson_table', 'Producteur de poisson de table'),
    ('mixte', 'Production mixte (alevins et poisson de table)'),
    ('commercant', 'Commerçant de poisson'),
]

# Statuts juridiques camerounais (basé sur recherche 2024)
LEGAL_STATUS_CHOICES = [
    # Entreprises individuelles
    ('ei', 'Entreprise Individuelle (EI)'),
    
    # Coopératives (qui ont remplacé les GIC)
    ('scoop', 'Coopérative Simplifiée (SCOOP)'),
    ('coop_ca', 'Coopérative avec Conseil d\'Administration (Coop-CA)'),
    
    # Sociétés commerciales
    ('sarl', 'Société à Responsabilité Limitée (SARL)'),
    ('sarlu', 'SARL Unipersonnelle (SARLU)'),
    ('sa', 'Société Anonyme (SA)'),
    ('sas', 'Société par Actions Simplifiée (SAS)'),
    ('sasu', 'SAS Unipersonnelle (SASU)'),
    ('snc', 'Société en Nom Collectif (SNC)'),
    ('scs', 'Société en Commandite Simple (SCS)'),
    
    # Sociétés civiles
    ('sci', 'Société Civile Immobilière (SCI)'),
    
    # Autres
    ('autre', 'Autre statut juridique'),
]

# 10 Régions du Cameroun (recherche officielle 2024)
REGION_CHOICES = [
    ('adamaoua', 'Adamaoua'),
    ('centre', 'Centre'),
    ('est', 'Est'),
    ('extreme_nord', 'Extrême-Nord'),
    ('littoral', 'Littoral'),
    ('nord', 'Nord'),
    ('nord_ouest', 'Nord-Ouest'),
    ('ouest', 'Ouest'),
    ('sud', 'Sud'),
    ('sud_ouest', 'Sud-Ouest'),
]

# Départements par région (58 départements au total)
DEPARTMENT_BY_REGION = {
    'adamaoua': [
        ('djerem', 'Djérem'),
        ('faro_deo', 'Faro-et-Déo'),
        ('mayo_banyo', 'Mayo-Banyo'),
        ('mbere', 'Mbéré'),
        ('vina', 'Vina'),
    ],
    'centre': [
        ('haute_sanaga', 'Haute-Sanaga'),
        ('lekie', 'Lekié'),
        ('mbam_inoubou', 'Mbam-et-Inoubou'),
        ('mbam_kim', 'Mbam-et-Kim'),
        ('mefou_afamba', 'Méfou-et-Afamba'),
        ('mefou_akono', 'Méfou-et-Akono'),
        ('mfoundi', 'Mfoundi'),
        ('nyong_kelle', 'Nyong-et-Kellé'),
        ('nyong_mfoumou', 'Nyong-et-Mfoumou'),
        ('nyong_soo', 'Nyong-et-So\'o'),
    ],
    'est': [
        ('boumba_ngoko', 'Boumba-et-Ngoko'),
        ('haut_nyong', 'Haut-Nyong'),
        ('kadey', 'Kadey'),
        ('lom_djerem', 'Lom-et-Djérem'),
    ],
    'extreme_nord': [
        ('diamare', 'Diamaré'),
        ('logone_chari', 'Logone-et-Chari'),
        ('mayo_danay', 'Mayo-Danay'),
        ('mayo_kani', 'Mayo-Kani'),
        ('mayo_sava', 'Mayo-Sava'),
        ('mayo_tsanaga', 'Mayo-Tsanaga'),
    ],
    'littoral': [
        ('moungo', 'Moungo'),
        ('nkam', 'Nkam'),
        ('sanaga_maritime', 'Sanaga-Maritime'),
        ('wouri', 'Wouri'),
    ],
    'nord': [
        ('benoue', 'Bénoué'),
        ('faro', 'Faro'),
        ('mayo_louti', 'Mayo-Louti'),
        ('mayo_rey', 'Mayo-Rey'),
    ],
    'nord_ouest': [
        ('boyo', 'Boyo'),
        ('bui', 'Bui'),
        ('donga_mantung', 'Donga-Mantung'),
        ('menchum', 'Menchum'),
        ('mezam', 'Mezam'),
        ('momo', 'Momo'),
        ('ngo_ketunjia', 'Ngo-Ketunjia'),
    ],
    'ouest': [
        ('bamboutos', 'Bamboutos'),
        ('haut_nkam', 'Haut-Nkam'),
        ('hauts_plateaux', 'Hauts-Plateaux'),
        ('koung_khi', 'Koung-Khi'),
        ('menoua', 'Menoua'),
        ('mifi', 'Mifi'),
        ('mino', 'Mino'),
        ('noun', 'Noun'),
    ],
    'sud': [
        ('dja_lobo', 'Dja-et-Lobo'),
        ('mvila', 'Mvila'),
        ('ocean', 'Océan'),
        ('vallee_ntem', 'Vallée-du-Ntem'),
    ],
    'sud_ouest': [
        ('fako', 'Fako'),
        ('kupe_manenguba', 'Kupé-Manenguba'),
        ('lebialem', 'Lebialem'),
        ('manyu', 'Manyu'),
        ('meme', 'Meme'),
        ('ndian', 'Ndian'),
    ],
}

# Classes d'âge pour personnes physiques
AGE_GROUP_CHOICES = [
    ('18_25', '18-25 ans'),
    ('26_35', '26-35 ans'),
    ('36_45', '36-45 ans'),
    ('46_55', '46-55 ans'),
    ('56_65', '56-65 ans'),
    ('65_plus', '65 ans et plus'),
]

# Langues supportées
LANGUAGE_CHOICES = [
    ('fr', 'Français'),
    ('en', 'English'),
]
