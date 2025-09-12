/**
 * Données géographiques du Cameroun pour faciliter la saisie utilisateur
 * Structure hiérarchique : Région → Département → Arrondissement → Communes
 */

export interface District {
  name: string;
  communes?: string[];
}

export interface Department {
  name: string;
  code: string;
  districts: District[];
}

export interface Region {
  name: string;
  code: string;
  departments: Department[];
}

/**
 * Régions du Cameroun avec départements et arrondissements
 */
export const CAMEROON_REGIONS: Region[] = [
  {
    name: "Adamaoua",
    code: "adamaoua",
    departments: [
      {
        name: "Djérem",
        code: "djerem",
        districts: [
          { name: "Belel" },
          { name: "Garoua-Boulaï" },
          { name: "Tibati" }
        ]
      },
      {
        name: "Faro-et-Déo", 
        code: "faro_et_deo",
        districts: [
          { name: "Galim" },
          { name: "Mayo-Baléo" },
          { name: "Tignère" }
        ]
      },
      {
        name: "Mayo-Banyo",
        code: "mayo_banyo", 
        districts: [
          { name: "Bankim" },
          { name: "Banyo" }
        ]
      },
      {
        name: "Mbéré",
        code: "mbere",
        districts: [
          { name: "Dir" },
          { name: "Djohong" },
          { name: "Meiganga" },
          { name: "Ngaoundal" }
        ]
      },
      {
        name: "Vina",
        code: "vina",
        districts: [
          { name: "Mbé" },
          { name: "Nganha" },
          { name: "Ngaoundéré 1er" },
          { name: "Ngaoundéré 2e" },
          { name: "Ngaoundéré 3e" },
          { name: "Martap" }
        ]
      }
    ]
  },
  {
    name: "Centre",
    code: "centre", 
    departments: [
      {
        name: "Haute-Sanaga",
        code: "haute_sanaga",
        districts: [
          { name: "Bibey" },
          { name: "Lembe-Yezoum" },
          { name: "Mbandjock" },
          { name: "Minta" },
          { name: "Nanga-Eboko" }
        ]
      },
      {
        name: "Lekié",
        code: "lekie", 
        districts: [
          { name: "Batchenga" },
          { name: "Ebebda" },
          { name: "Evodoula" },
          { name: "Lobo" },
          { name: "Monatele" },
          { name: "Obala" },
          { name: "Okola" },
          { name: "Sa'a" }
        ]
      },
      {
        name: "Mbam-et-Inoubou",
        code: "mbam_et_inoubou",
        districts: [
          { name: "Bafia" },
          { name: "Bokito" },
          { name: "Deuk" },
          { name: "Kiinda" },
          { name: "Kon-Kradt" },
          { name: "Makénéné" },
          { name: "Ndikiniméki" },
          { name: "Nitoukou" },
          { name: "Ombéssa" }
        ]
      },
      {
        name: "Mbam-et-Kim",
        code: "mbam_et_kim",
        districts: [
          { name: "Mbangassina" },
          { name: "Ngambé-Tikar" },
          { name: "Ngoro" },
          { name: "Ntui" },
          { name: "Yoko" }
        ]
      },
      {
        name: "Méfou-et-Afamba", 
        code: "mefou_et_afamba",
        districts: [
          { name: "Afanoyoa" },
          { name: "Akono" },
          { name: "Esse" },
          { name: "Mbankomo" },
          { name: "Ngoumou" },
          { name: "Soa" },
          { name: "Awae" }
        ]
      },
      {
        name: "Méfou-et-Akono",
        code: "mefou_et_akono", 
        districts: [
          { name: "Bikok" },
          { name: "Nkolafamba" },
          { name: "Nsem" },
          { name: "Olanguina" }
        ]
      },
      {
        name: "Mfoundi",
        code: "mfoundi",
        districts: [
          { name: "Yaoundé 1er", communes: ["Yaoundé I"] },
          { name: "Yaoundé 2e", communes: ["Yaoundé II"] },
          { name: "Yaoundé 3e", communes: ["Yaoundé III"] },
          { name: "Yaoundé 4e", communes: ["Yaoundé IV"] },
          { name: "Yaoundé 5e", communes: ["Yaoundé V"] },
          { name: "Yaoundé 6e", communes: ["Yaoundé VI"] },
          { name: "Yaoundé 7e", communes: ["Yaoundé VII"] }
        ]
      },
      {
        name: "Nyong-et-Kéllé",
        code: "nyong_et_kelle",
        districts: [
          { name: "Biyouha" },
          { name: "Bot-Makak" },
          { name: "Dibang" },
          { name: "Eseka" },
          { name: "Makak" },
          { name: "Matomb" },
          { name: "Ngog-Mapubi" },
          { name: "Nguibassal" }
        ]
      },
      {
        name: "Nyong-et-Mfoumou",
        code: "nyong_et_mfoumou",
        districts: [
          { name: "Akonolinga" },
          { name: "Ayos" },
          { name: "Kobdombo" },
          { name: "Mengang" },
          { name: "Nyong-Mfoumou" }
        ]
      },
      {
        name: "Nyong-et-So'o",
        code: "nyong_et_soo", 
        districts: [
          { name: "Dzeng" },
          { name: "Mbalmayo" },
          { name: "Mengueme" },
          { name: "Ngomedzap" },
          { name: "Nkolmetet" }
        ]
      }
    ]
  },
  {
    name: "Est",
    code: "est",
    departments: [
      {
        name: "Boumba-et-Ngoko",
        code: "boumba_et_ngoko",
        districts: [
          { name: "Gari-Gombo" },
          { name: "Moloundou" },
          { name: "Salapoumbé" },
          { name: "Yokadouma" }
        ]
      },
      {
        name: "Haut-Nyong",
        code: "haut_nyong",
        districts: [
          { name: "Abong-Mbang" },
          { name: "Atok" },
          { name: "Bertoua-Ville" },
          { name: "Dimako" },
          { name: "Doumaintang" },
          { name: "Doumé" },
          { name: "Mindourou" },
          { name: "Ngoura" }
        ]
      },
      {
        name: "Kadey",
        code: "kadey",
        districts: [
          { name: "Batouri" },
          { name: "Kenzou" },
          { name: "Ndelele" },
          { name: "Ouli" }
        ]
      },
      {
        name: "Lom-et-Djérem",
        code: "lom_et_djerem", 
        districts: [
          { name: "Bélabo" },
          { name: "Betare-Oya" },
          { name: "Garoua-Boulaï" },
          { name: "Ndiang" }
        ]
      }
    ]
  },
  {
    name: "Extrême-Nord",
    code: "extreme_nord",
    departments: [
      {
        name: "Diamaré",
        code: "diamare",
        districts: [
          { name: "Bogo" },
          { name: "Dargala" },
          { name: "Gawar" },
          { name: "Maroua 1er" },
          { name: "Maroua 2e" },
          { name: "Maroua 3e" },
          { name: "Gazawa" },
          { name: "Mindif" },
          { name: "Mokong" },
          { name: "Petté" }
        ]
      },
      {
        name: "Logone-et-Chari", 
        code: "logone_et_chari",
        districts: [
          { name: "Fotokol" },
          { name: "Goulfey" },
          { name: "Hile-Alifa" },
          { name: "Kousseri" },
          { name: "Logone-Birni" },
          { name: "Makary" },
          { name: "Waza" },
          { name: "Zina" }
        ]
      },
      {
        name: "Mayo-Danay",
        code: "mayo_danay",
        districts: [
          { name: "Datcheka" },
          { name: "Gobo" },
          { name: "Kai-Kai" },
          { name: "Kalfou" },
          { name: "Lara" },
          { name: "Moutourwa" },
          { name: "Tchatibali" },
          { name: "Véle" },
          { name: "Yagoua" }
        ]
      },
      {
        name: "Mayo-Kani",
        code: "mayo_kani", 
        districts: [
          { name: "Dziguilao" },
          { name: "Guidiguis" },
          { name: "Kaélé" },
          { name: "Mindif" },
          { name: "Moutourwa" }
        ]
      },
      {
        name: "Mayo-Sava",
        code: "mayo_sava",
        districts: [
          { name: "Kolofata" },
          { name: "Mora" },
          { name: "Tokombéré" }
        ]
      },
      {
        name: "Mayo-Tsanaga",
        code: "mayo_tsanaga", 
        districts: [
          { name: "Hina" },
          { name: "Koza" },
          { name: "Mayo-Moskota" },
          { name: "Mogodé" },
          { name: "Mokolo" }
        ]
      }
    ]
  },
  {
    name: "Littoral",
    code: "littoral",
    departments: [
      {
        name: "Moungo",
        code: "moungo",
        districts: [
          { name: "Bonaléa" },
          { name: "Dibombari" },
          { name: "Loum" },
          { name: "Manjo" },
          { name: "Mbanga" },
          { name: "Melong" },
          { name: "Mombo" },
          { name: "Nkongsamba 1er" },
          { name: "Nkongsamba 2e" },
          { name: "Nkongsamba 3e" },
          { name: "Nlonako" }
        ]
      },
      {
        name: "Nkam", 
        code: "nkam",
        districts: [
          { name: "Ndom" },
          { name: "Nkonsamba" },
          { name: "Yabassi" }
        ]
      },
      {
        name: "Sanaga-Maritime",
        code: "sanaga_maritime", 
        districts: [
          { name: "Dizangué" },
          { name: "Edéa 1er" },
          { name: "Edéa 2e" },
          { name: "Mouanko" },
          { name: "Nyanon" },
          { name: "Pouma" }
        ]
      },
      {
        name: "Wouri",
        code: "wouri",
        districts: [
          { 
            name: "Douala 1er", 
            communes: [
              "Akwa", "Bonanjo", "Bonapriso", "Bali"
            ] 
          },
          { 
            name: "Douala 2ème", 
            communes: [
              "New-Bell Aéroport",
              "New-Bell Bonadouma", "New-Bell Congo", "New-Bell Kassalafam", 
              "Deido Bonatéki", "Deido Bonajinjee",
              "Deido Bonamoudourou", "Deido Bonantone", "Deido Bonamula",
              "Bassa New Town", "Bassa Bonaloka", "Bassa Entrée de Billes",
              "Bassa Bobongo", "Bassa Boko", "Bassa Ndogpassi", "Bassa Ndokoti",
              "Bassa Nyalla", "Bassa Ngangue", "Bassa Ndog-Bong", "Bassa C.C.C."
            ] 
          },
          { 
            name: "Douala 3ème", 
            communes: [
              "Logbaba", "Yassa", "Nylon", "Maképé",
              "Mboko", "Ndogbati",
              "Ngodi-Bakoko", "Japoma", "Logbessou", "Dibamba Bonaloka",
              "Cité Berge 1", "Dibom I Espoir", "Diboum 2", "PK14", "Tergal", "Ndokotti"
            ] 
          },
          { 
            name: "Douala 4ème", 
            communes: [
              "Bonabéri", "Bonassama",
            ] 
          },
          { 
            name: "Douala 5ème", 
            communes: [
              "Kotto", "Bépanda", "Bonamoussadi", "Logpom"
            ] 
          },
          { 
            name: "Douala 6ème", 
            communes: [
              "Manoka", "Monkoko", "Toube", "Cap Cameroun", "Komo"
            ] 
          }
        ]
      }
    ]
  },
  {
    name: "Nord",
    code: "nord", 
    departments: [
      {
        name: "Bénoué",
        code: "benoue",
        districts: [
          { name: "Garoua 1er" },
          { name: "Garoua 2e" },
          { name: "Garoua 3e" },
          { name: "Bascheo" },
          { name: "Dembo" },
          { name: "Garoua-Boulaï" },
          { name: "Lagdo" },
          { name: "Pitoa" }
        ]
      },
      {
        name: "Faro",
        code: "faro", 
        districts: [
          { name: "Poli" },
          { name: "Madingring" }
        ]
      },
      {
        name: "Mayo-Louti",
        code: "mayo_louti",
        districts: [
          { name: "Bibemi" },
          { name: "Figuil" },
          { name: "Guider" },
          { name: "Mayo-Oulo" }
        ]
      },
      {
        name: "Mayo-Rey",
        code: "mayo_rey", 
        districts: [
          { name: "Madingring" },
          { name: "Mayo-Baléo" },
          { name: "Tcholliré" },
          { name: "Touboro" }
        ]
      }
    ]
  },
  {
    name: "Nord-Ouest",
    code: "nord_ouest",
    departments: [
      {
        name: "Boyo",
        code: "boyo",
        districts: [
          { name: "Belo" },
          { name: "Fundong" },
          { name: "Jakiri" },
          { name: "Njinikom" },
          { name: "Wum" }
        ]
      },
      {
        name: "Bui", 
        code: "bui",
        districts: [
          { name: "Djottin" },
          { name: "Elak-Oku" },
          { name: "Kumbo" },
          { name: "Mbiame" },
          { name: "Nkum" },
          { name: "Oku" }
        ]
      },
      {
        name: "Donga-Mantung",
        code: "donga_mantung", 
        districts: [
          { name: "Ako" },
          { name: "Misaje" },
          { name: "Ndu" },
          { name: "Nkambe" },
          { name: "Nwa" }
        ]
      },
      {
        name: "Menchum",
        code: "menchum",
        districts: [
          { name: "Benakuma" },
          { name: "Furu-Awa" },
          { name: "Wum" }
        ]
      },
      {
        name: "Mezam",
        code: "mezam", 
        districts: [
          { name: "Bafut" },
          { name: "Bamenda 1er" },
          { name: "Bamenda 2e" },
          { name: "Bamenda 3e" },
          { name: "Santa" },
          { name: "Tubah" }
        ]
      },
      {
        name: "Momo",
        code: "momo",
        districts: [
          { name: "Batibo" },
          { name: "Mbengwi" },
          { name: "Njikwa" },
          { name: "Widikum-Boffe" }
        ]
      },
      {
        name: "Ngokentunjia",
        code: "ngokentunjia", 
        districts: [
          { name: "Babessi" },
          { name: "Balikumbat" },
          { name: "Foumbot" },
          { name: "Ndop" }
        ]
      }
    ]
  },
  {
    name: "Ouest",
    code: "ouest",
    departments: [
      {
        name: "Bamboutos",
        code: "bamboutos",
        districts: [
          { name: "Babadjou" },
          { name: "Batcham" },
          { name: "Galim" },
          { name: "Mbouda" }
        ]
      },
      {
        name: "Haut-Nkam", 
        code: "haut_nkam",
        districts: [
          { name: "Bafang" },
          { name: "Banka" },
          { name: "Kekem" }
        ]
      },
      {
        name: "Hauts-Plateaux",
        code: "hauts_plateaux", 
        districts: [
          { name: "Baham" },
          { name: "Bamendjou" },
          { name: "Bangou" }
        ]
      },
      {
        name: "Koung-Khi",
        code: "koung_khi",
        districts: [
          { name: "Bandjoun" },
          { name: "Djebem" }
        ]
      },
      {
        name: "Menoua",
        code: "menoua", 
        districts: [
          { name: "Dschang" },
          { name: "Fongo-Ndeng" },
          { name: "Fongo-Tongo" },
          { name: "Fokoué" },
          { name: "Nkong-Ni" },
          { name: "Penka-Michel" },
          { name: "Santchou" }
        ]
      },
      {
        name: "Mifi",
        code: "mifi",
        districts: [
          { name: "Bafoussam 1er" },
          { name: "Bafoussam 2e" },
          { name: "Bafoussam 3e" }
        ]
      },
      {
        name: "Mino",
        code: "mino", 
        districts: [
          { name: "Kékem" },
          { name: "Kouoptamo" }
        ]
      },
      {
        name: "Ndé",
        code: "nde",
        districts: [
          { name: "Bangoulap" },
          { name: "Bassamba" },
          { name: "Bazou" },
          { name: "Tonga" }
        ]
      },
      {
        name: "Noun",
        code: "noun", 
        districts: [
          { name: "Foumban" },
          { name: "Foumbot" },
          { name: "Koutaba" },
          { name: "Magba" },
          { name: "Malantouen" },
          { name: "Massangam" }
        ]
      }
    ]
  },
  {
    name: "Sud",
    code: "sud",
    departments: [
      {
        name: "Dja-et-Lobo",
        code: "dja_et_lobo", 
        districts: [
          { name: "Bengbis" },
          { name: "Djoum" },
          { name: "Mintom" },
          { name: "Oveng" },
          { name: "Sangmélima" }
        ]
      },
      {
        name: "Mvila",
        code: "mvila",
        districts: [
          { name: "Biwong-Bulu" },
          { name: "Ebolowa 1er" },
          { name: "Ebolowa 2e" },
          { name: "Efoulan" },
          { name: "Mengong" },
          { name: "Mvangane" },
          { name: "Ngoulemakong" }
        ]
      },
      {
        name: "Océan",
        code: "ocean", 
        districts: [
          { name: "Akom II" },
          { name: "Campo" },
          { name: "Kribi 1er" },
          { name: "Kribi 2e" },
          { name: "Lolodorf" },
          { name: "Lokoundje" }
        ]
      },
      {
        name: "Vallée-du-Ntem",
        code: "vallee_du_ntem",
        districts: [
          { name: "Ambam" },
          { name: "Kye-Ossi" },
          { name: "Ma'an" },
          { name: "Olamze" }
        ]
      }
    ]
  },
  {
    name: "Sud-Ouest",
    code: "sud_ouest", 
    departments: [
      {
        name: "Fako",
        code: "fako",
        districts: [
          { name: "Buea" },
          { name: "Idenau" },
          { name: "Limbe 1er" },
          { name: "Limbe 2e" },
          { name: "Limbe 3e" },
          { name: "Muyuka" },
          { name: "Tiko" },
          { name: "West-Coast" }
        ]
      },
      {
        name: "Koupé-Manengouba",
        code: "koupe_manengouba", 
        districts: [
          { name: "Bangem" },
          { name: "Nguti" },
          { name: "Tombel" }
        ]
      },
      {
        name: "Lebialem",
        code: "lebialem",
        districts: [
          { name: "Alou" },
          { name: "Fontem" },
          { name: "Menji" },
          { name: "Wabane" }
        ]
      },
      {
        name: "Manyu", 
        code: "manyu",
        districts: [
          { name: "Akwaya" },
          { name: "Eyumojock" },
          { name: "Mamfe" },
          { name: "Upper-Bayang" }
        ]
      },
      {
        name: "Meme",
        code: "meme",
        districts: [
          { name: "Konye" },
          { name: "Kumba 1er" },
          { name: "Kumba 2e" },
          { name: "Kumba 3e" },
          { name: "Mbonge" }
        ]
      },
      {
        name: "Ndian",
        code: "ndian", 
        districts: [
          { name: "Dikome-Balue" },
          { name: "Ekondo-Titi" },
          { name: "Isangele" },
          { name: "Kombo-Abedimo" },
          { name: "Kombo-Itindi" },
          { name: "Mundemba" },
          { name: "Toko" }
        ]
      }
    ]
  }
];

/**
 * Zones d'intervention aquacoles prédéfinies
 * Les labels utilisent les clés de traduction i18next
 */
export const INTERVENTION_ZONES = [
  { value: 'urbaine', labelKey: 'urbaine' },
  { value: 'periurbaine', labelKey: 'periurbaine' }, 
  { value: 'rurale', labelKey: 'rurale' },
  { value: 'fluviale', labelKey: 'fluviale' },
  { value: 'lacustre', labelKey: 'lacustre' },
  { value: 'cotiere', labelKey: 'cotiere' },
  { value: 'montagnarde', labelKey: 'montagnarde' },
  { value: 'nationale', labelKey: 'nationale' },
  { value: 'regionale', labelKey: 'regionale' },
  { value: 'departementale', labelKey: 'departementale' },
];

/**
 * Utilitaires pour récupérer les données géographiques
 */
export const getRegionByCode = (code: string): Region | undefined => {
  return CAMEROON_REGIONS.find(region => region.code === code);
};

export const getDepartmentsByRegion = (regionCode: string): Department[] => {
  const region = getRegionByCode(regionCode);
  return region?.departments || [];
};

export const getDistrictsByDepartment = (regionCode: string, departmentCode: string): District[] => {
  const region = getRegionByCode(regionCode);
  const department = region?.departments.find(dept => dept.code === departmentCode);
  return department?.districts || [];
};

export const getAllDepartments = (): { value: string; label: string; region: string }[] => {
  const departments: { value: string; label: string; region: string }[] = [];
  
  CAMEROON_REGIONS.forEach(region => {
    region.departments.forEach(department => {
      departments.push({
        value: department.code,
        label: department.name,
        region: region.name
      });
    });
  });
  
  return departments.sort((a, b) => a.label.localeCompare(b.label));
};

export const getAllDistricts = (): { value: string; label: string; department: string; region: string }[] => {
  const districts: { value: string; label: string; department: string; region: string }[] = [];
  
  CAMEROON_REGIONS.forEach(region => {
    region.departments.forEach(department => {
      department.districts.forEach(district => {
        districts.push({
          value: district.name.toLowerCase().replace(/\s+/g, '_'),
          label: district.name,
          department: department.name,
          region: region.name
        });
      });
    });
  });
  
  return districts.sort((a, b) => a.label.localeCompare(b.label));
};

/**
 * Récupère tous les quartiers d'un arrondissement de Douala
 */
export const getQuartiersDouala = (districtName: string): { value: string; label: string }[] => {
  const wouri = CAMEROON_REGIONS.find(r => r.code === 'littoral')?.departments.find(d => d.code === 'wouri');
  const district = wouri?.districts.find(d => d.name === districtName);
  
  if (district?.communes) {
    return district.communes.map(quartier => ({
      value: quartier.toLowerCase().replace(/\s+/g, '_').replace(/['èéàùô]/g, ''),
      label: quartier
    })).sort((a, b) => a.label.localeCompare(b.label));
  }
  
  return [];
};

/**
 * Vérifie si un arrondissement est un arrondissement de Douala
 */
export const isDoualaDistrict = (districtName: string): boolean => {
  return districtName.toLowerCase().includes('douala');
};

/**
 * Récupère tous les quartiers disponibles pour les sélecteurs (focus sur Douala)
 */
export const getAllAvailableNeighborhoods = (): { value: string; label: string; district: string }[] => {
  const neighborhoods: { value: string; label: string; district: string }[] = [];
  
  // Focus sur Douala pour l'instant
  const wouri = CAMEROON_REGIONS.find(r => r.code === 'littoral')?.departments.find(d => d.code === 'wouri');
  
  wouri?.districts.forEach(district => {
    if (district.communes) {
      district.communes.forEach(quartier => {
        neighborhoods.push({
          value: quartier.toLowerCase().replace(/\s+/g, '_').replace(/['èéàùô]/g, ''),
          label: quartier,
          district: district.name
        });
      });
    }
  });
  
  return neighborhoods.sort((a, b) => a.label.localeCompare(b.label));
};