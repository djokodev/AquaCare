/**
 * DonnÃ©es gÃ©ographiques officielles du Cameroun
 * HiÃ©rarchie : RÃ©gion â†’ DÃ©partement â†’ Arrondissement â†’ Ville â†’ Quartier
 */

export interface City {
  name: string;
  code: string;
  neighborhoods?: string[]; // Quartiers disponibles
  isChefLieu?: boolean; // Ville chef-lieu d'arrondissement
}

export interface Arrondissement {
  name: string;
  code: string;
  cities: City[];
  chefLieu: string; // Chef-lieu de l'arrondissement
}

export interface Department {
  name: string;
  code: string;
  arrondissements: Arrondissement[];
  chefLieu: string; // Chef-lieu du dÃ©partement
}

export interface Region {
  name: string;
  code: string;
  departments: Department[];
  chefLieu: string; // Chef-lieu de la rÃ©gion
}

/**
 * RÃ©publique du Cameroun - Structure administrative complÃ¨te
 * 10 RÃ©gions, 58 DÃ©partements
 */
export const CAMEROON_REGIONS: Region[] = [
  // ===== RÃ‰GION ADAMAOUA =====
  {
    name: "Adamaoua",
    code: "adamaoua",
    chefLieu: "NgaoundÃ©rÃ©",
    departments: [
      {
        name: "DjÃ©rem",
        code: "djerem",
        chefLieu: "Tibati",
        arrondissements: [
          {
            name: "Tibati",
            code: "tibati",
            chefLieu: "Tibati",
            cities: [
              { name: "Tibati", code: "tibati", isChefLieu: true, neighborhoods: ["Centre-ville", "Quartier Haoussa"] }
            ]
          }
        ]
      },
      {
        name: "Faro-et-DÃ©o",
        code: "faro_deo",
        chefLieu: "TignÃ¨re",
        arrondissements: [
          {
            name: "TignÃ¨re",
            code: "tignere",
            chefLieu: "TignÃ¨re",
            cities: [
              { name: "TignÃ¨re", code: "tignere", isChefLieu: true, neighborhoods: ["Centre", "Galim"] }
            ]
          }
        ]
      },
      {
        name: "Mayo-Banyo",
        code: "mayo_banyo",
        chefLieu: "Banyo",
        arrondissements: [
          {
            name: "Banyo",
            code: "banyo",
            chefLieu: "Banyo",
            cities: [
              { name: "Banyo", code: "banyo", isChefLieu: true, neighborhoods: ["Centre-ville", "Mayo-Banyo"] }
            ]
          }
        ]
      },
      {
        name: "MbÃ©rÃ©",
        code: "mbere",
        chefLieu: "Meiganga",
        arrondissements: [
          {
            name: "Meiganga",
            code: "meiganga",
            chefLieu: "Meiganga",
            cities: [
              { name: "Meiganga", code: "meiganga", isChefLieu: true, neighborhoods: ["Centre", "Sabongari"] }
            ]
          }
        ]
      },
      {
        name: "Vina",
        code: "vina",
        chefLieu: "NgaoundÃ©rÃ©",
        arrondissements: [
          {
            name: "NgaoundÃ©rÃ© 1er",
            code: "ngaoundere_1",
            chefLieu: "NgaoundÃ©rÃ©",
            cities: [
              { name: "NgaoundÃ©rÃ©", code: "ngaoundere", isChefLieu: true, neighborhoods: ["Centre-ville", "Petit marchÃ©", "Sabongari"] }
            ]
          }
        ]
      }
    ]
  },

  // ===== RÃ‰GION CENTRE =====
  {
    name: "Centre",
    code: "centre",
    chefLieu: "YaoundÃ©",
    departments: [
      {
        name: "Haute-Sanaga",
        code: "haute_sanaga",
        chefLieu: "Nanga-Ã‰boko",
        arrondissements: [
          {
            name: "Nanga-Ã‰boko",
            code: "nanga_eboko",
            chefLieu: "Nanga-Ã‰boko",
            cities: [
              { name: "Nanga-Ã‰boko", code: "nanga_eboko", isChefLieu: true, neighborhoods: ["Centre", "Carrefour"] }
            ]
          }
        ]
      },
      {
        name: "LekiÃ©",
        code: "lekie",
        chefLieu: "MonatÃ©lÃ©",
        arrondissements: [
          {
            name: "MonatÃ©lÃ©",
            code: "monatele",
            chefLieu: "MonatÃ©lÃ©",
            cities: [
              { name: "MonatÃ©lÃ©", code: "monatele", isChefLieu: true, neighborhoods: ["Centre-ville"] }
            ]
          }
        ]
      },
      {
        name: "Mbam-et-Inoubou",
        code: "mbam_inoubou",
        chefLieu: "Bafia",
        arrondissements: [
          {
            name: "Bafia",
            code: "bafia",
            chefLieu: "Bafia",
            cities: [
              { name: "Bafia", code: "bafia", isChefLieu: true, neighborhoods: ["Centre", "Lelem", "Mbamkassa"] }
            ]
          }
        ]
      },
      {
        name: "Mbam-et-Kim",
        code: "mbam_kim",
        chefLieu: "Ntui",
        arrondissements: [
          {
            name: "Ntui",
            code: "ntui",
            chefLieu: "Ntui",
            cities: [
              { name: "Ntui", code: "ntui", isChefLieu: true, neighborhoods: ["Centre-ville"] }
            ]
          }
        ]
      },
      {
        name: "MÃ©fou-et-Afamba",
        code: "mefou_afamba",
        chefLieu: "Mfou",
        arrondissements: [
          {
            name: "Mfou",
            code: "mfou",
            chefLieu: "Mfou",
            cities: [
              { name: "Mfou", code: "mfou", isChefLieu: true, neighborhoods: ["Centre", "Carrefour Mfou"] }
            ]
          }
        ]
      },
      {
        name: "MÃ©fou-et-Akono",
        code: "mefou_akono",
        chefLieu: "Ngoumou",
        arrondissements: [
          {
            name: "Ngoumou",
            code: "ngoumou",
            chefLieu: "Ngoumou",
            cities: [
              { name: "Ngoumou", code: "ngoumou", isChefLieu: true, neighborhoods: ["Centre-ville"] }
            ]
          }
        ]
      },
      {
        name: "Mfoundi",
        code: "mfoundi",
        chefLieu: "YaoundÃ©",
        arrondissements: [
          {
            name: "YaoundÃ© 1er",
            code: "yaounde_1",
            chefLieu: "YaoundÃ©",
            cities: [
              { 
                name: "YaoundÃ©", 
                code: "yaounde", 
                isChefLieu: true, 
                neighborhoods: [
                  "Centre-ville", "Mbankolo", "Essos", "Melen", "Kondengui",
                  "Nkolbisson", "Emana", "Bastos", "Ntougou", "Ekounou"
                ] 
              }
            ]
          },
          {
            name: "YaoundÃ© 2Ã¨me",
            code: "yaounde_2",
            chefLieu: "YaoundÃ©",
            cities: [
              { name: "YaoundÃ©", code: "yaounde", neighborhoods: ["Biyem-Assi", "Nkolmesseng"] }
            ]
          }
        ]
      },
      {
        name: "Nyong-et-KÃ©llÃ©",
        code: "nyong_kelle",
        chefLieu: "EsÃ©ka",
        arrondissements: [
          {
            name: "EsÃ©ka",
            code: "eseka",
            chefLieu: "EsÃ©ka",
            cities: [
              { name: "EsÃ©ka", code: "eseka", isChefLieu: true, neighborhoods: ["Centre", "Gare"] }
            ]
          }
        ]
      },
      {
        name: "Nyong-et-Mfoumou",
        code: "nyong_mfoumou",
        chefLieu: "Akonolinga",
        arrondissements: [
          {
            name: "Akonolinga",
            code: "akonolinga",
            chefLieu: "Akonolinga",
            cities: [
              { name: "Akonolinga", code: "akonolinga", isChefLieu: true, neighborhoods: ["Centre-ville"] }
            ]
          }
        ]
      },
      {
        name: "Nyong-et-So'o",
        code: "nyong_soo",
        chefLieu: "Mbalmayo",
        arrondissements: [
          {
            name: "Mbalmayo",
            code: "mbalmayo",
            chefLieu: "Mbalmayo",
            cities: [
              { name: "Mbalmayo", code: "mbalmayo", isChefLieu: true, neighborhoods: ["Centre", "Carrefour"] }
            ]
          }
        ]
      }
    ]
  },

  // ===== RÃ‰GION EST =====
  {
    name: "Est",
    code: "est",
    chefLieu: "Bertoua",
    departments: [
      {
        name: "Boumba-et-Ngoko",
        code: "boumba_ngoko",
        chefLieu: "Yokadouma",
        arrondissements: [
          {
            name: "Yokadouma",
            code: "yokadouma",
            chefLieu: "Yokadouma",
            cities: [
              { name: "Yokadouma", code: "yokadouma", isChefLieu: true, neighborhoods: ["Centre-ville"] }
            ]
          }
        ]
      },
      {
        name: "Haut-Nyong",
        code: "haut_nyong",
        chefLieu: "Abong-Mbang",
        arrondissements: [
          {
            name: "Abong-Mbang",
            code: "abong_mbang",
            chefLieu: "Abong-Mbang",
            cities: [
              { name: "Abong-Mbang", code: "abong_mbang", isChefLieu: true, neighborhoods: ["Centre", "Gare"] }
            ]
          }
        ]
      },
      {
        name: "Kadey",
        code: "kadey",
        chefLieu: "Batouri",
        arrondissements: [
          {
            name: "Batouri",
            code: "batouri",
            chefLieu: "Batouri",
            cities: [
              { name: "Batouri", code: "batouri", isChefLieu: true, neighborhoods: ["Centre-ville"] }
            ]
          }
        ]
      },
      {
        name: "Lom-et-DjÃ©rem",
        code: "lom_djerem",
        chefLieu: "Bertoua",
        arrondissements: [
          {
            name: "Bertoua 1er",
            code: "bertoua_1",
            chefLieu: "Bertoua",
            cities: [
              { name: "Bertoua", code: "bertoua", isChefLieu: true, neighborhoods: ["Centre-ville", "Sabongari"] }
            ]
          }
        ]
      }
    ]
  },

  // ===== RÃ‰GION EXTRÃŠME-NORD =====
  {
    name: "ExtrÃªme-Nord",
    code: "extreme_nord",
    chefLieu: "Maroua",
    departments: [
      {
        name: "DiamarÃ©",
        code: "diamare",
        chefLieu: "Maroua",
        arrondissements: [
          {
            name: "Maroua 1er",
            code: "maroua_1",
            chefLieu: "Maroua",
            cities: [
              { name: "Maroua", code: "maroua", isChefLieu: true, neighborhoods: ["Centre-ville", "Djarengol", "Domayo"] }
            ]
          }
        ]
      },
      {
        name: "Logone-et-Chari",
        code: "logone_chari",
        chefLieu: "KoussÃ©ri",
        arrondissements: [
          {
            name: "KoussÃ©ri",
            code: "kousseri",
            chefLieu: "KoussÃ©ri",
            cities: [
              { name: "KoussÃ©ri", code: "kousseri", isChefLieu: true, neighborhoods: ["Centre", "FrontiÃ¨re"] }
            ]
          }
        ]
      },
      {
        name: "Mayo-Danay",
        code: "mayo_danay",
        chefLieu: "Yagoua",
        arrondissements: [
          {
            name: "Yagoua",
            code: "yagoua",
            chefLieu: "Yagoua",
            cities: [
              { name: "Yagoua", code: "yagoua", isChefLieu: true, neighborhoods: ["Centre-ville"] }
            ]
          }
        ]
      },
      {
        name: "Mayo-Kani",
        code: "mayo_kani",
        chefLieu: "KaÃ©lÃ©",
        arrondissements: [
          {
            name: "KaÃ©lÃ©",
            code: "kaele",
            chefLieu: "KaÃ©lÃ©",
            cities: [
              { name: "KaÃ©lÃ©", code: "kaele", isChefLieu: true, neighborhoods: ["Centre-ville"] }
            ]
          }
        ]
      },
      {
        name: "Mayo-Sava",
        code: "mayo_sava",
        chefLieu: "Mora",
        arrondissements: [
          {
            name: "Mora",
            code: "mora",
            chefLieu: "Mora",
            cities: [
              { name: "Mora", code: "mora", isChefLieu: true, neighborhoods: ["Centre-ville"] }
            ]
          }
        ]
      },
      {
        name: "Mayo-Tsanaga",
        code: "mayo_tsanaga",
        chefLieu: "Mokolo",
        arrondissements: [
          {
            name: "Mokolo",
            code: "mokolo",
            chefLieu: "Mokolo",
            cities: [
              { name: "Mokolo", code: "mokolo", isChefLieu: true, neighborhoods: ["Centre-ville"] }
            ]
          }
        ]
      }
    ]
  },

  // ===== RÃ‰GION LITTORAL =====
  {
    name: "Littoral",
    code: "littoral",
    chefLieu: "Douala",
    departments: [
      {
        name: "Moungo",
        code: "moungo",
        chefLieu: "Nkongsamba",
        arrondissements: [
          {
            name: "Nkongsamba 1er",
            code: "nkongsamba_1",
            chefLieu: "Nkongsamba",
            cities: [
              { 
                name: "Nkongsamba", 
                code: "nkongsamba", 
                isChefLieu: true, 
                neighborhoods: ["Centre-ville", "Quartier Haoussa", "Mayouka", "Mbouroukou"] 
              }
            ]
          },
          {
            name: "Loum",
            code: "loum",
            chefLieu: "Loum",
            cities: [
              { name: "Loum", code: "loum", isChefLieu: true, neighborhoods: ["Centre", "Gare"] }
            ]
          }
        ]
      },
      {
        name: "Nkam",
        code: "nkam",
        chefLieu: "Yabassi",
        arrondissements: [
          {
            name: "Yabassi",
            code: "yabassi",
            chefLieu: "Yabassi",
            cities: [
              { name: "Yabassi", code: "yabassi", isChefLieu: true, neighborhoods: ["Centre-ville", "Port"] }
            ]
          },
          {
            name: "Yingui",
            code: "yingui",
            chefLieu: "Yingui",
            cities: [
              { name: "Yingui", code: "yingui", isChefLieu: true, neighborhoods: ["Centre"] }
            ]
          }
        ]
      },
      {
        name: "Sanaga-Maritime",
        code: "sanaga_maritime",
        chefLieu: "Ã‰dÃ©a",
        arrondissements: [
          {
            name: "Ã‰dÃ©a 1er",
            code: "edea_1",
            chefLieu: "Ã‰dÃ©a",
            cities: [
              { name: "Ã‰dÃ©a", code: "edea", isChefLieu: true, neighborhoods: ["Centre-ville", "Camp SIC", "Carrefour Ã‰dÃ©a"] }
            ]
          },
          {
            name: "DizanguÃ©",
            code: "dizangue",
            chefLieu: "DizanguÃ©",
            cities: [
              { name: "DizanguÃ©", code: "dizangue", isChefLieu: true, neighborhoods: ["Centre", "Port"] }
            ]
          }
        ]
      },
      {
        name: "Wouri",
        code: "wouri",
        chefLieu: "Douala",
        arrondissements: [
          {
            name: "Douala 1er",
            code: "douala_1",
            chefLieu: "Douala",
            cities: [
              { 
                name: "Douala", 
                code: "douala", 
                isChefLieu: true, 
                neighborhoods: [
                  "Akwa", "Bonanjo", "BonabÃ©ri", "Bassa", "Deido", "Makepe",
                  "New-Bell", "Nylon", "PK8", "Logpom", "Bonapriso", "BÃ©panda"
                ] 
              }
            ]
          },
          {
            name: "Douala 2Ã¨me",
            code: "douala_2",
            chefLieu: "Douala",
            cities: [
              { name: "Douala", code: "douala", neighborhoods: ["New-Bell", "Nylon"] }
            ]
          },
          {
            name: "Douala 3Ã¨me",
            code: "douala_3",
            chefLieu: "Douala", 
            cities: [
              { name: "Douala", code: "douala", neighborhoods: ["Bassa", "Logpom"] }
            ]
          },
          {
            name: "Douala 4Ã¨me",
            code: "douala_4",
            chefLieu: "Douala",
            cities: [
              { name: "Douala", code: "douala", neighborhoods: ["BonabÃ©ri", "Makepe"] }
            ]
          },
          {
            name: "Douala 5Ã¨me",
            code: "douala_5",
            chefLieu: "Douala",
            cities: [
              { name: "Douala", code: "douala", neighborhoods: ["Kotto", "Logbaba"] }
            ]
          }
        ]
      }
    ]
  },

  // ===== RÃ‰GION NORD =====
  {
    name: "Nord",
    code: "nord",
    chefLieu: "Garoua",
    departments: [
      {
        name: "BÃ©nouÃ©",
        code: "benoue",
        chefLieu: "Garoua",
        arrondissements: [
          {
            name: "Garoua 1er",
            code: "garoua_1",
            chefLieu: "Garoua",
            cities: [
              { name: "Garoua", code: "garoua", isChefLieu: true, neighborhoods: ["Centre-ville", "Plateau", "Djamboutou"] }
            ]
          }
        ]
      },
      {
        name: "Faro",
        code: "faro",
        chefLieu: "Poli",
        arrondissements: [
          {
            name: "Poli",
            code: "poli",
            chefLieu: "Poli",
            cities: [
              { name: "Poli", code: "poli", isChefLieu: true, neighborhoods: ["Centre-ville"] }
            ]
          }
        ]
      },
      {
        name: "Mayo-Louti",
        code: "mayo_louti",
        chefLieu: "Guider",
        arrondissements: [
          {
            name: "Guider",
            code: "guider",
            chefLieu: "Guider",
            cities: [
              { name: "Guider", code: "guider", isChefLieu: true, neighborhoods: ["Centre-ville"] }
            ]
          }
        ]
      },
      {
        name: "Mayo-Rey",
        code: "mayo_rey",
        chefLieu: "TchollirÃ©",
        arrondissements: [
          {
            name: "TchollirÃ©",
            code: "tchollire",
            chefLieu: "TchollirÃ©",
            cities: [
              { name: "TchollirÃ©", code: "tchollire", isChefLieu: true, neighborhoods: ["Centre-ville"] }
            ]
          }
        ]
      }
    ]
  },

  // ===== RÃ‰GION NORD-OUEST =====
  {
    name: "Nord-Ouest",
    code: "nord_ouest",
    chefLieu: "Bamenda",
    departments: [
      {
        name: "Boyo",
        code: "boyo",
        chefLieu: "Fundong",
        arrondissements: [
          {
            name: "Fundong",
            code: "fundong",
            chefLieu: "Fundong",
            cities: [
              { name: "Fundong", code: "fundong", isChefLieu: true, neighborhoods: ["Centre-ville"] }
            ]
          }
        ]
      },
      {
        name: "Bui",
        code: "bui",
        chefLieu: "Kumbo",
        arrondissements: [
          {
            name: "Kumbo",
            code: "kumbo",
            chefLieu: "Kumbo",
            cities: [
              { name: "Kumbo", code: "kumbo", isChefLieu: true, neighborhoods: ["Centre-ville"] }
            ]
          }
        ]
      },
      {
        name: "Donga-Mantung",
        code: "donga_mantung",
        chefLieu: "Nkambe",
        arrondissements: [
          {
            name: "Nkambe",
            code: "nkambe",
            chefLieu: "Nkambe",
            cities: [
              { name: "Nkambe", code: "nkambe", isChefLieu: true, neighborhoods: ["Centre-ville"] }
            ]
          }
        ]
      },
      {
        name: "Menchum",
        code: "menchum",
        chefLieu: "Wum",
        arrondissements: [
          {
            name: "Wum",
            code: "wum",
            chefLieu: "Wum",
            cities: [
              { name: "Wum", code: "wum", isChefLieu: true, neighborhoods: ["Centre-ville"] }
            ]
          }
        ]
      },
      {
        name: "Mezam",
        code: "mezam",
        chefLieu: "Bamenda",
        arrondissements: [
          {
            name: "Bamenda 1er",
            code: "bamenda_1",
            chefLieu: "Bamenda",
            cities: [
              { 
                name: "Bamenda", 
                code: "bamenda", 
                isChefLieu: true, 
                neighborhoods: ["Commercial Avenue", "Up Station", "Down Town", "Mile 4"] 
              }
            ]
          },
          {
            name: "Bamenda 2Ã¨me",
            code: "bamenda_2",
            chefLieu: "Bamenda",
            cities: [
              { name: "Bamenda", code: "bamenda", neighborhoods: ["Santa", "Bafut"] }
            ]
          }
        ]
      },
      {
        name: "Momo",
        code: "momo",
        chefLieu: "Mbengwi",
        arrondissements: [
          {
            name: "Mbengwi",
            code: "mbengwi",
            chefLieu: "Mbengwi",
            cities: [
              { name: "Mbengwi", code: "mbengwi", isChefLieu: true, neighborhoods: ["Centre-ville"] }
            ]
          }
        ]
      },
      {
        name: "Ngo-Ketunjia",
        code: "ngo_ketunjia",
        chefLieu: "Ndop",
        arrondissements: [
          {
            name: "Ndop",
            code: "ndop",
            chefLieu: "Ndop",
            cities: [
              { name: "Ndop", code: "ndop", isChefLieu: true, neighborhoods: ["Centre-ville"] }
            ]
          }
        ]
      }
    ]
  },

  // ===== RÃ‰GION OUEST =====
  {
    name: "Ouest",
    code: "ouest",
    chefLieu: "Bafoussam",
    departments: [
      {
        name: "Bamboutos",
        code: "bamboutos",
        chefLieu: "Mbouda",
        arrondissements: [
          {
            name: "Mbouda",
            code: "mbouda",
            chefLieu: "Mbouda",
            cities: [
              { name: "Mbouda", code: "mbouda", isChefLieu: true, neighborhoods: ["Centre-ville", "MarchÃ©"] },
              { name: "Galim", code: "galim", neighborhoods: ["Centre", "Station"] }
            ]
          },
          {
            name: "Galim",
            code: "galim_arr",
            chefLieu: "Galim",
            cities: [
              { name: "Galim", code: "galim", isChefLieu: true, neighborhoods: ["Centre-ville"] }
            ]
          }
        ]
      },
      {
        name: "Haut-Nkam",
        code: "haut_nkam",
        chefLieu: "Bafang",
        arrondissements: [
          {
            name: "Bafang",
            code: "bafang",
            chefLieu: "Bafang",
            cities: [
              { name: "Bafang", code: "bafang", isChefLieu: true, neighborhoods: ["Centre-ville", "Quartier Administratif"] },
              { name: "KÃ©kem", code: "kekem", neighborhoods: ["Centre", "Gare"] }
            ]
          },
          {
            name: "KÃ©kem",
            code: "kekem_arr",
            chefLieu: "KÃ©kem",
            cities: [
              { name: "KÃ©kem", code: "kekem", isChefLieu: true, neighborhoods: ["Centre-ville"] }
            ]
          }
        ]
      },
      {
        name: "Hauts-Plateaux",
        code: "hauts_plateaux",
        chefLieu: "Baham",
        arrondissements: [
          {
            name: "Baham",
            code: "baham",
            chefLieu: "Baham",
            cities: [
              { name: "Baham", code: "baham", isChefLieu: true, neighborhoods: ["Centre-ville"] }
            ]
          }
        ]
      },
      {
        name: "Koung-Khi",
        code: "koung_khi",
        chefLieu: "Bandjoun",
        arrondissements: [
          {
            name: "Bandjoun",
            code: "bandjoun",
            chefLieu: "Bandjoun",
            cities: [
              { name: "Bandjoun", code: "bandjoun", isChefLieu: true, neighborhoods: ["Centre-ville", "Carrefour"] }
            ]
          }
        ]
      },
      {
        name: "Menoua",
        code: "menoua",
        chefLieu: "Dschang",
        arrondissements: [
          {
            name: "Dschang",
            code: "dschang",
            chefLieu: "Dschang",
            cities: [
              { 
                name: "Dschang", 
                code: "dschang", 
                isChefLieu: true, 
                neighborhoods: ["Centre-ville", "Foto", "Foreke-Dschang", "UniversitÃ©"] 
              },
              { name: "FokouÃ©", code: "fokoue", neighborhoods: ["Centre", "MarchÃ©"] }
            ]
          },
          {
            name: "FokouÃ©",
            code: "fokoue_arr",
            chefLieu: "FokouÃ©",
            cities: [
              { name: "FokouÃ©", code: "fokoue", isChefLieu: true, neighborhoods: ["Centre-ville"] }
            ]
          }
        ]
      },
      {
        name: "Mifi",
        code: "mifi",
        chefLieu: "Bafoussam",
        arrondissements: [
          {
            name: "Bafoussam 1er",
            code: "bafoussam_1",
            chefLieu: "Bafoussam",
            cities: [
              { 
                name: "Bafoussam", 
                code: "bafoussam", 
                isChefLieu: true, 
                neighborhoods: [
                  "Centre-ville", "Tamdja", "Djeleng", "Famla", "Kamkop", 
                  "Quartier Administratif", "MarchÃ© A"
                ] 
              }
            ]
          },
          {
            name: "Bafoussam 2Ã¨me",
            code: "bafoussam_2",
            chefLieu: "Bafoussam",
            cities: [
              { name: "Bafoussam", code: "bafoussam", neighborhoods: ["Banengo", "Tougang"] }
            ]
          }
        ]
      },
      {
        name: "NdÃ©",
        code: "nde",
        chefLieu: "BangangtÃ©",
        arrondissements: [
          {
            name: "BangangtÃ©",
            code: "bangante",
            chefLieu: "BangangtÃ©",
            cities: [
              { name: "BangangtÃ©", code: "bangante", isChefLieu: true, neighborhoods: ["Centre-ville", "MarchÃ©"] },
              { name: "Bassamba", code: "bassamba", neighborhoods: ["Centre"] }
            ]
          },
          {
            name: "Bassamba",
            code: "bassamba_arr",
            chefLieu: "Bassamba",
            cities: [
              { name: "Bassamba", code: "bassamba", isChefLieu: true, neighborhoods: ["Centre-ville"] }
            ]
          }
        ]
      },
      {
        name: "Noun",
        code: "noun",
        chefLieu: "Foumban",
        arrondissements: [
          {
            name: "Foumban",
            code: "foumban",
            chefLieu: "Foumban",
            cities: [
              { 
                name: "Foumban", 
                code: "foumban", 
                isChefLieu: true, 
                neighborhoods: ["Centre-ville", "Palais Royal", "Quartier Haoussa", "Njinka"] 
              },
              { name: "Foumbot", code: "foumbot", neighborhoods: ["Centre", "Gare"] }
            ]
          },
          {
            name: "Foumbot",
            code: "foumbot_arr",
            chefLieu: "Foumbot",
            cities: [
              { name: "Foumbot", code: "foumbot", isChefLieu: true, neighborhoods: ["Centre-ville"] }
            ]
          },
          {
            name: "Kouoptamo",
            code: "kouoptamo",
            chefLieu: "Kouoptamo",
            cities: [
              { name: "Kouoptamo", code: "kouoptamo", isChefLieu: true, neighborhoods: ["Centre-ville"] }
            ]
          }
        ]
      }
    ]
  },

  // ===== RÃ‰GION SUD =====
  {
    name: "Sud",
    code: "sud",
    chefLieu: "Ebolowa",
    departments: [
      {
        name: "Dja-et-Lobo",
        code: "dja_lobo",
        chefLieu: "SangmÃ©lima",
        arrondissements: [
          {
            name: "SangmÃ©lima",
            code: "sangmelima",
            chefLieu: "SangmÃ©lima",
            cities: [
              { name: "SangmÃ©lima", code: "sangmelima", isChefLieu: true, neighborhoods: ["Centre-ville"] }
            ]
          }
        ]
      },
      {
        name: "Mvila",
        code: "mvila",
        chefLieu: "Ebolowa",
        arrondissements: [
          {
            name: "Ebolowa 1er",
            code: "ebolowa_1",
            chefLieu: "Ebolowa",
            cities: [
              { name: "Ebolowa", code: "ebolowa", isChefLieu: true, neighborhoods: ["Centre-ville", "Carrefour Ebolowa"] }
            ]
          }
        ]
      },
      {
        name: "OcÃ©an",
        code: "ocean",
        chefLieu: "Kribi",
        arrondissements: [
          {
            name: "Kribi",
            code: "kribi",
            chefLieu: "Kribi",
            cities: [
              { 
                name: "Kribi", 
                code: "kribi", 
                isChefLieu: true, 
                neighborhoods: ["Centre-ville", "Port", "Plage", "Quartier Mokolo"] 
              }
            ]
          },
          {
            name: "Campo",
            code: "campo",
            chefLieu: "Campo",
            cities: [
              { name: "Campo", code: "campo", isChefLieu: true, neighborhoods: ["Centre", "FrontiÃ¨re"] }
            ]
          }
        ]
      },
      {
        name: "VallÃ©e-du-Ntem",
        code: "vallee_ntem",
        chefLieu: "Ambam",
        arrondissements: [
          {
            name: "Ambam",
            code: "ambam",
            chefLieu: "Ambam",
            cities: [
              { name: "Ambam", code: "ambam", isChefLieu: true, neighborhoods: ["Centre-ville", "FrontiÃ¨re"] }
            ]
          }
        ]
      }
    ]
  },

  // ===== RÃ‰GION SUD-OUEST =====
  {
    name: "Sud-Ouest",
    code: "sud_ouest",
    chefLieu: "BuÃ©a",
    departments: [
      {
        name: "Fako",
        code: "fako",
        chefLieu: "LimbÃ©",
        arrondissements: [
          {
            name: "LimbÃ© 1er",
            code: "limbe_1",
            chefLieu: "LimbÃ©",
            cities: [
              { 
                name: "LimbÃ©", 
                code: "limbe", 
                isChefLieu: true, 
                neighborhoods: ["Down Beach", "Church Street", "Half Mile", "Botanical Garden"] 
              }
            ]
          },
          {
            name: "BuÃ©a",
            code: "buea_arr",
            chefLieu: "BuÃ©a",
            cities: [
              { 
                name: "BuÃ©a", 
                code: "buea", 
                isChefLieu: true, 
                neighborhoods: ["Government Station", "Town", "University of Buea", "Molyko"] 
              }
            ]
          }
        ]
      },
      {
        name: "KoupÃ©-Manengouba",
        code: "koupe_manengouba",
        chefLieu: "Bangem",
        arrondissements: [
          {
            name: "Bangem",
            code: "bangem",
            chefLieu: "Bangem",
            cities: [
              { name: "Bangem", code: "bangem", isChefLieu: true, neighborhoods: ["Centre-ville"] }
            ]
          }
        ]
      },
      {
        name: "Lebialem",
        code: "lebialem",
        chefLieu: "Menji",
        arrondissements: [
          {
            name: "Menji",
            code: "menji",
            chefLieu: "Menji",
            cities: [
              { name: "Menji", code: "menji", isChefLieu: true, neighborhoods: ["Centre-ville"] }
            ]
          }
        ]
      },
      {
        name: "Manyu",
        code: "manyu",
        chefLieu: "Mamfe",
        arrondissements: [
          {
            name: "Mamfe",
            code: "mamfe",
            chefLieu: "Mamfe",
            cities: [
              { name: "Mamfe", code: "mamfe", isChefLieu: true, neighborhoods: ["Centre-ville", "Cross River"] }
            ]
          }
        ]
      },
      {
        name: "Meme",
        code: "meme",
        chefLieu: "Kumba",
        arrondissements: [
          {
            name: "Kumba",
            code: "kumba",
            chefLieu: "Kumba",
            cities: [
              { name: "Kumba", code: "kumba", isChefLieu: true, neighborhoods: ["Town", "Fiango", "Kosala"] }
            ]
          }
        ]
      },
      {
        name: "Ndian",
        code: "ndian",
        chefLieu: "Mundemba",
        arrondissements: [
          {
            name: "Mundemba",
            code: "mundemba",
            chefLieu: "Mundemba",
            cities: [
              { name: "Mundemba", code: "mundemba", isChefLieu: true, neighborhoods: ["Centre-ville"] }
            ]
          }
        ]
      }
    ]
  }
];

// ===== FONCTIONS UTILITAIRES =====

/**
 * RÃ©cupÃ¨re tous les dÃ©partements d'une rÃ©gion
 */
export function getDepartmentsByRegion(regionCode: string): Department[] {
  const region = CAMEROON_REGIONS.find(r => r.code === regionCode);
  return region?.departments || [];
}

/**
 * RÃ©cupÃ¨re tous les arrondissements d'un dÃ©partement
 */
export function getArrondissementsByDepartment(regionCode: string, departmentName: string): Arrondissement[] {
  const region = CAMEROON_REGIONS.find(r => r.code === regionCode);
  const department = region?.departments.find(d => d.name === departmentName);
  return department?.arrondissements || [];
}

/**
 * RÃ©cupÃ¨re toutes les villes d'un arrondissement
 */
export function getCitiesByArrondissement(regionCode: string, departmentName: string, arrondissementName: string): City[] {
  const region = CAMEROON_REGIONS.find(r => r.code === regionCode);
  const department = region?.departments.find(d => d.name === departmentName);
  const arrondissement = department?.arrondissements.find(a => a.name === arrondissementName);
  return arrondissement?.cities || [];
}

/**
 * RÃ©cupÃ¨re tous les quartiers d'une ville
 */
export function getNeighborhoodsByCity(regionCode: string, departmentName: string, arrondissementName: string, cityName: string): string[] {
  const region = CAMEROON_REGIONS.find(r => r.code === regionCode);
  const department = region?.departments.find(d => d.name === departmentName);
  const arrondissement = department?.arrondissements.find(a => a.name === arrondissementName);
  const city = arrondissement?.cities.find(c => c.name === cityName);
  return city?.neighborhoods || [];
}

/**
 * Interface pour les donnÃ©es de localisation sÃ©lectionnÃ©es
 */
export interface LocationData {
  region?: string;
  department?: string;
  arrondissement?: string;
  city?: string;
  neighborhood?: string;
}

/**
 * Fonction pour obtenir le nom d'affichage d'une localisation
 */
export function getLocationDisplayName(location: LocationData): string {
  const parts = [];
  if (location.neighborhood) parts.push(location.neighborhood);
  if (location.city) parts.push(location.city);
  if (location.arrondissement) parts.push(location.arrondissement);
  if (location.department) parts.push(location.department);
  if (location.region) parts.push(location.region);
  return parts.join(", ");
}

/**
 * RÃ©cupÃ¨re tous les dÃ©partements de toutes les rÃ©gions
 */
export function getAllDepartments(): Department[] {
  return CAMEROON_REGIONS.flatMap(region => region.departments);
}

/**
 * RÃ©cupÃ¨re tous les arrondissements de tous les dÃ©partements
 */
export function getAllArrondissements(): Arrondissement[] {
  return CAMEROON_REGIONS.flatMap(region => 
    region.departments.flatMap(dept => dept.arrondissements)
  );
}

/**
 * RÃ©cupÃ¨re toutes les villes de tous les arrondissements
 */
export function getAllCities(): City[] {
  return CAMEROON_REGIONS.flatMap(region => 
    region.departments.flatMap(dept => 
      dept.arrondissements.flatMap(arr => arr.cities)
    )
  );
}

/**
 * RÃ©cupÃ¨re tous les quartiers d'un arrondissement (toutes villes confondues)
 */
export function getNeighborhoodsByArrondissement(regionCode: string, departmentName: string, arrondissementName: string): string[] {
  const region = CAMEROON_REGIONS.find(r => r.code === regionCode);
  const department = region?.departments.find(d => d.name === departmentName);
  const arrondissement = department?.arrondissements.find(a => a.name === arrondissementName);
  
  const allNeighborhoods: string[] = [];
  arrondissement?.cities.forEach(city => {
    if (city.neighborhoods) {
      allNeighborhoods.push(...city.neighborhoods);
    }
  });
  
  // Retirer les doublons et trier
  return Array.from(new Set(allNeighborhoods)).sort();
}

/**
 * VÃ©rifie si un arrondissement a des quartiers
 */
export function hasNeighborhoods(regionCode: string, departmentCode: string, arrondissementCode: string): boolean {
  return getNeighborhoodsByArrondissement(regionCode, departmentCode, arrondissementCode).length > 0;
}

/**
 * RÃ©cupÃ¨re une rÃ©gion par son code
 */
export function getRegionByCode(regionCode: string): Region | undefined {
  return CAMEROON_REGIONS.find(r => r.code === regionCode);
}

/**
 * Zones d'intervention pour compatibility
 */
export const INTERVENTION_ZONES = [
  { value: 'urbaine', labelKey: 'urbaine', code: 'urbaine', name: 'Zone urbaine' },
  { value: 'periurbaine', labelKey: 'periurbaine', code: 'periurbaine', name: 'Zone pÃ©ri-urbaine' },
  { value: 'rurale', labelKey: 'rurale', code: 'rurale', name: 'Zone rurale' },
  { value: 'fluviale', labelKey: 'fluviale', code: 'fluviale', name: 'Zone fluviale' },
  { value: 'lacustre', labelKey: 'lacustre', code: 'lacustre', name: 'Zone lacustre' },
  { value: 'cotiere', labelKey: 'cotiere', code: 'cotiere', name: 'Zone cÃ´tiÃ¨re' },
  { value: 'montagnarde', labelKey: 'montagnarde', code: 'montagnarde', name: 'Zone montagnarde' }
];



