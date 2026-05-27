import React, { useState, useEffect, useMemo } from 'react';
import { FileText, Settings, Calculator, Archive, Plus, Trash2, Download, Upload, Edit2, Save, X, Check, Copy } from 'lucide-react';
import { Document, Packer, Paragraph, TextRun, Table as DocxTable, TableRow as DocxTableRow, TableCell as DocxTableCell, AlignmentType, WidthType, BorderStyle, ShadingType } from 'docx';
import { saveAs } from 'file-saver';

// ============================================================================
// SUPABASE CONFIG
// ============================================================================

const SUPABASE_URL = 'https://aykxvdllnjnmaixgkhjf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5a3h2ZGxsbmpubWFpeGdraGpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4Njc4NzIsImV4cCI6MjA5NTQ0Mzg3Mn0.VoyhyTgPaFo4EOv-8t9ltvLam5SxV_iTUXaoKoZv0iE';

const supabaseCall = async (table, method = 'GET', data = null) => {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const opts = {
    method,
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
  };
  if (data) opts.body = JSON.stringify(data);
  
  try {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error(`Supabase ${table} error:`, e);
    return null;
  }
};

// ============================================================================
// DONNÉES PAR DÉFAUT (local)
// ============================================================================

const DEFAULT_CABINET = {
  raisonSociale: 'LCE AVOCATS NOTAIRES',
  adresse: '143 Avenue de Kéradennec\nCS 23014\n29334 QUIMPER Cédex',
  telephone: '02 98 90 04 35',
  fax: '02 98 53 14 50',
  email: 'accueil-quimper@lce-avocats.com',
  siteWeb: 'www.lce-avocats.com',
  formeJuridique: 'SELARL au capital de 416 675 €',
  rcs: 'RCS Brest 300 824 232',
  tauxTVA: 20,
  logo: null,
  mentionsLegales: 'Conformément aux articles L 612-2 et suivants du Code de la Consommation, en cas de litige, le Consommateur a la possibilité de saisir le Médiateur de la consommation de la Profession d\'Avocat, par voie postale à : Médiateur de la consommation de la profession d\'avocat, 180 boulevard Haussmann, 75008 Paris ; par courriel : mediateur@mediateur-consommation-avocat.fr.',
};

const DEFAULT_AVOCATS = [
  { id: 'av1', nom: 'LCE Avocats', titre: 'Avocat associé', email: 'accueil-quimper@lce-avocats.com' },
];

// ============================================================================
// PERSISTANCE LOCAL
// ============================================================================

const storageHelper = {
  get(key, fallback) {
    try {
      const v = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
      return v ? JSON.parse(v) : fallback;
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('Storage error', e);
    }
  },
};

// ============================================================================
// FORMATAGE
// ============================================================================

const fmt = (n) => {
  const v = Number(n) || 0;
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtEur = (n) => `${fmt(n)} €`;

// ============================================================================
// CALCULATEURS
// ============================================================================

function calcCessionFondsCommerce(prix) {
  const p = Number(prix) || 0;
  let droit = 0;
  if (p <= 23000) {
    droit = 0;
  } else if (p <= 200000) {
    droit = (p - 23000) * 0.03;
  } else {
    droit = (200000 - 23000) * 0.03 + (p - 200000) * 0.05;
  }
  droit = Math.max(droit, 25); // Minimum 25€
  return Math.round(droit * 100) / 100;
}

function calcCessionParts(prix, partsCedees, partsTotal) {
  const p = Number(prix) || 0;
  const pc = Number(partsCedees) || 0;
  const pt = Number(partsTotal) || 1;
  const abattement = 23000 * (pc / pt);
  const base = Math.max(0, p - abattement);
  let droit = base * 0.03;
  droit = Math.max(droit, 25); // Minimum 25€
  return { droit: Math.round(droit * 100) / 100, abattement: Math.round(abattement * 100) / 100, base: Math.round(base * 100) / 100 };
}

function calcCessionActions(prix) {
  const p = Number(prix) || 0;
  let droit = p * 0.001;
  droit = Math.max(droit, 25); // Minimum 25€
  return Math.round(droit * 100) / 100;
}

function calcCessionImmeubleSocietes(prix) {
  const p = Number(prix) || 0;
  let droit = p * 0.05;
  droit = Math.max(droit, 25); // Minimum 25€
  return Math.round(droit * 100) / 100;
}

// ============================================================================
// APP PRINCIPAL
// ============================================================================

export default function App() {
  const [tab, setTab] = useState('devis');
  const [loaded, setLoaded] = useState(false);

  // Données locales
  const [cabinet, setCabinet] = useState(DEFAULT_CABINET);
  const [avocats, setAvocats] = useState(DEFAULT_AVOCATS);

  // Données de Supabase (partagées)
  const [prestations, setPrestations] = useState([]);
  const [fraisCatalogue, setFraisCatalogue] = useState([]);
  const [historique, setHistorique] = useState([]);
  const [syncStatus, setSyncStatus] = useState('loading'); // 'loading', 'ok', 'error'

  // Devis courant
  const [devis, setDevis] = useState(() => emptyDevis());

  // Chargement initial
  useEffect(() => {
    (async () => {
      // Charger local
      const c = storageHelper.get('lce_cabinet', DEFAULT_CABINET);
      setCabinet(c);

      // Charger Supabase
      try {
        const [aData, pData, fData, hData] = await Promise.all([
          supabaseCall('avocats'),
          supabaseCall('prestations'),
          supabaseCall('frais_divers'),
          supabaseCall('historique_devis?order=created_at.desc'),
        ]);

        if (aData) setAvocats(aData);
        if (pData) setPrestations(pData);
        if (fData) setFraisCatalogue(fData);
        if (hData) setHistorique(hData.map(h => ({ ...h, donnees_completes: typeof h.donnees_completes === 'string' ? JSON.parse(h.donnees_completes) : h.donnees_completes })));
        
        setDevis(d => ({ ...d, avocatId: aData?.[0]?.id || '' }));
        setSyncStatus('ok');
      } catch (e) {
        console.error('Supabase sync failed:', e);
        setSyncStatus('error');
      }

      setLoaded(true);
    })();
  }, []);

  // Sauvegarde auto local
  useEffect(() => { if (loaded) storageHelper.set('lce_cabinet', cabinet); }, [cabinet, loaded]);

  function emptyDevis() {
    return {
      reference: `DEV-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`,
      date: new Date().toISOString().slice(0, 10),
      avocatId: '',
      client: { nom: '', adresse: '' },
      objet: '',
      natureTravaux: '',
      lignesPrestations: [],
      lignesFrais: [],
      droitsEnregistrement: { montant: 0, detail: '' },
      provisionHonoraires: 0,
      provisionFrais: 0,
      tauxTVA: 20,
    };
  }

  const tabs = [
    { id: 'devis', label: 'Nouveau devis', icon: FileText },
    { id: 'droits', label: 'Calculateur droits', icon: Calculator },
    { id: 'parametres', label: 'Paramètres', icon: Settings },
    { id: 'historique', label: 'Historique', icon: Archive },
  ];

  if (!loaded) {
    return (
      <div style={{ ...styles.app, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#6b7280' }}>
          <div style={{ fontSize: 16, marginBottom: 8 }}>Chargement...</div>
          <div style={{ fontSize: 12, color: '#9ca3af' }}>Synchronisation avec Supabase</div>
          {syncStatus === 'error' && <div style={{ fontSize: 12, color: '#dc2626', marginTop: 8 }}>⚠️ Erreur de connexion</div>}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.brand}>
            {cabinet.logo ? (
              <img src={cabinet.logo} alt="LCE" style={styles.brandLogo} />
            ) : (
              <div style={styles.brandText}>
                <div style={styles.brandTitle}>LCE</div>
                <div style={styles.brandSubtitle}>AVOCATS NOTAIRES</div>
              </div>
            )}
            <div style={styles.brandSep}></div>
            <div style={styles.brandApp}>Générateur de devis</div>
            {syncStatus === 'ok' && <div style={{ ...styles.syncBadge, marginLeft: 'auto' }}>🟢 Sync</div>}
            {syncStatus === 'error' && <div style={{ ...styles.syncBadge, marginLeft: 'auto', background: '#fca5a5' }}>⚠️ Hors ligne</div>}
          </div>
        </div>
        <nav style={styles.nav}>
          {tabs.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{ ...styles.navBtn, ...(active ? styles.navBtnActive : {}) }}
              >
                <Icon size={16} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>
      </header>

      <main style={styles.main}>
        {tab === 'devis' && (
          <DevisTab
            devis={devis}
            setDevis={setDevis}
            cabinet={cabinet}
            avocats={avocats}
            prestations={prestations}
            fraisCatalogue={fraisCatalogue}
            historique={historique}
            setHistorique={setHistorique}
            resetDevis={() => setDevis({ ...emptyDevis(), avocatId: avocats[0]?.id || '' })}
            onOpenCalc={() => setTab('droits')}
          />
        )}
        {tab === 'droits' && (
          <DroitsTab
            onApplyToDevis={(montant, detail) => {
              setDevis(d => ({ ...d, droitsEnregistrement: { montant, detail } }));
              setTab('devis');
            }}
          />
        )}
        {tab === 'parametres' && (
          <ParametresTab
            cabinet={cabinet} setCabinet={setCabinet}
            avocats={avocats} setAvocats={setAvocats}
            prestations={prestations} setPrestations={setPrestations}
            fraisCatalogue={fraisCatalogue} setFraisCatalogue={setFraisCatalogue}
            syncStatus={syncStatus}
          />
        )}
        {tab === 'historique' && (
          <HistoriqueTab
            historique={historique}
            setHistorique={setHistorique}
            onOpen={(d) => { setDevis(d.donnees_completes || d); setTab('devis'); }}
          />
        )}
      </main>
    </div>
  );
}

// ============================================================================
// ONGLET DEVIS (SIMPLIFIÉ)
// ============================================================================

function DevisTab({ devis, setDevis, cabinet, avocats, prestations, fraisCatalogue, historique, setHistorique, resetDevis, onOpenCalc }) {
  const [filterCat, setFilterCat] = useState('all');
  const categories = useMemo(() => ['all', ...new Set(prestations.map(p => p.categorie))], [prestations]);
  const lignesIds = new Set(devis.lignesPrestations.map(l => l.prestation_id || l.prestationId));
  const fraisIds = new Set(devis.lignesFrais.map(l => l.frais_id || l.fraisId));

  function togglePrestation(p) {
    const pid = p.id;
    if (lignesIds.has(pid)) {
      setDevis(d => ({ ...d, lignesPrestations: d.lignesPrestations.filter(l => (l.prestation_id || l.prestationId) !== pid) }));
    } else {
      setDevis(d => ({
        ...d,
        lignesPrestations: [...d.lignesPrestations, {
          id: `lp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          prestation_id: pid,
          libelle: p.libelle,
          honoraires: p.honoraires,
          frais: p.frais,
        }],
      }));
    }
  }

  function toggleFrais(f) {
    const fid = f.id;
    if (fraisIds.has(fid)) {
      setDevis(d => ({ ...d, lignesFrais: d.lignesFrais.filter(l => (l.frais_id || l.fraisId) !== fid) }));
    } else {
      setDevis(d => ({
        ...d,
        lignesFrais: [...d.lignesFrais, {
          id: `lf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          frais_id: fid,
          libelle: f.libelle,
          montant: f.montant,
        }],
      }));
    }
  }

  function updateLignePrestation(id, field, value) {
    setDevis(d => ({
      ...d,
      lignesPrestations: d.lignesPrestations.map(l => l.id === id ? { ...l, [field]: value } : l),
    }));
  }

  function updateLigneFrais(id, field, value) {
    setDevis(d => ({
      ...d,
      lignesFrais: d.lignesFrais.map(l => l.id === id ? { ...l, [field]: value } : l),
    }));
  }

  function deleteLignePrestation(id) {
    setDevis(d => ({ ...d, lignesPrestations: d.lignesPrestations.filter(l => l.id !== id) }));
  }

  function deleteLigneFrais(id) {
    setDevis(d => ({ ...d, lignesFrais: d.lignesFrais.filter(l => l.id !== id) }));
  }

  function addLigneLibrePrestation() {
    setDevis(d => ({
      ...d,
      lignesPrestations: [...d.lignesPrestations, {
        id: `lp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        prestation_id: null,
        libelle: 'Prestation personnalisée',
        honoraires: 0,
        frais: 0,
      }],
    }));
  }

  function addLigneLibreFrais() {
    setDevis(d => ({
      ...d,
      lignesFrais: [...d.lignesFrais, {
        id: `lf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        frais_id: null,
        libelle: 'Frais divers',
        montant: 0,
      }],
    }));
  }

  const totaux = useMemo(() => {
    const honorairesHT = devis.lignesPrestations.reduce((s, l) => s + (Number(l.honoraires) || 0), 0);
    const fraisPrestationsHT = devis.lignesPrestations.reduce((s, l) => s + (Number(l.frais) || 0), 0);
    const fraisDiversHT = devis.lignesFrais.reduce((s, l) => s + (Number(l.montant) || 0), 0);
    const totalFraisHT = fraisPrestationsHT + fraisDiversHT;
    const droits = Number(devis.droitsEnregistrement.montant) || 0;
    const tauxTVA = (Number(devis.tauxTVA) || 0) / 100;

    const tvaHonoraires = honorairesHT * tauxTVA;
    const tvaFrais = totalFraisHT * tauxTVA;
    const honorairesTTC = honorairesHT + tvaHonoraires;
    const fraisTTC = totalFraisHT + tvaFrais + droits;
    const totalTTC = honorairesTTC + fraisTTC;

    return { honorairesHT, fraisPrestationsHT, fraisDiversHT, totalFraisHT, droits, tvaHonoraires, tvaFrais, honorairesTTC, fraisTTC, totalTTC };
  }, [devis]);

  const filteredPrestations = useMemo(
    () => filterCat === 'all' ? prestations : prestations.filter(p => p.categorie === filterCat),
    [prestations, filterCat]
  );

  async function saveToHistory() {
    const avocat = avocats.find(a => a.id === devis.avocatId);
    const entry = {
      reference: devis.reference,
      date: devis.date,
      avocat_id: devis.avocatId,
      avocat_nom: avocat?.nom || '',
      client_nom: devis.client.nom,
      adresse_client: devis.client.adresse,
      nature_travaux: devis.natureTravaux,
      total_ttc: totaux.totalTTC,
      donnees_completes: devis,
    };

    const result = await supabaseCall('historique_devis', 'POST', entry);
    if (result) {
      setHistorique([{ ...entry, id: result[0]?.id || Date.now(), donnees_completes: devis }, ...historique]);
      alert('✅ Devis enregistré et synchronisé !');
    } else {
      alert('⚠️ Erreur de synchronisation. Vérifiez votre connexion.');
    }
  }

  return (
    <div style={styles.grid2col}>
      <div style={styles.col}>
        <Section title="Informations du devis">
          <div style={styles.formGrid}>
            <Field label="Référence">
              <input style={styles.input} value={devis.reference} onChange={e => setDevis(d => ({ ...d, reference: e.target.value }))} />
            </Field>
            <Field label="Date">
              <input style={styles.input} type="date" value={devis.date} onChange={e => setDevis(d => ({ ...d, date: e.target.value }))} />
            </Field>
            <Field label="Avocat signataire">
              <select style={styles.input} value={devis.avocatId} onChange={e => setDevis(d => ({ ...d, avocatId: e.target.value }))}>
                <option value="">— Sélectionner —</option>
                {avocats.map(a => <option key={a.id} value={a.id}>{a.nom} {a.titre ? `(${a.titre})` : ''}</option>)}
              </select>
            </Field>
            <Field label="Taux TVA (%)">
              <input style={styles.input} type="number" step="0.1" value={devis.tauxTVA} onChange={e => setDevis(d => ({ ...d, tauxTVA: Number(e.target.value) }))} />
            </Field>
            <Field label="Client / Société" full>
              <input style={styles.input} value={devis.client.nom} onChange={e => setDevis(d => ({ ...d, client: { ...d.client, nom: e.target.value } }))} />
            </Field>
            <Field label="Adresse client" full>
              <textarea style={{ ...styles.input, minHeight: 60 }} value={devis.client.adresse} onChange={e => setDevis(d => ({ ...d, client: { ...d.client, adresse: e.target.value } }))} />
            </Field>
            <Field label="Nature des travaux" full>
              <textarea style={{ ...styles.input, minHeight: 80 }} value={devis.natureTravaux} onChange={e => setDevis(d => ({ ...d, natureTravaux: e.target.value }))} />
            </Field>
          </div>
        </Section>

        <Section title="Prestations" actions={
          <select style={styles.inputSm} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
            {categories.map(c => <option key={c} value={c}>{c === 'all' ? 'Toutes' : c}</option>)}
          </select>
        }>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead><tr><th style={{ width: 36 }}></th><th>Prestation</th><th style={{ width: 80, textAlign: 'right' }}>Honoraires</th><th style={{ width: 80, textAlign: 'right' }}>Frais</th></tr></thead>
              <tbody>
                {filteredPrestations.map(p => {
                  const checked = lignesIds.has(p.id);
                  return (
                    <tr key={p.id} style={checked ? styles.trChecked : null} onClick={() => togglePrestation(p)}>
                      <td style={styles.td}><input type="checkbox" checked={checked} onChange={() => {}} /></td>
                      <td style={styles.td}><div style={{ fontSize: 13 }}>{p.libelle}</div><div style={styles.tagCat}>{p.categorie}</div></td>
                      <td style={{ ...styles.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtEur(p.honoraires)}</td>
                      <td style={{ ...styles.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtEur(p.frais)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Frais divers">
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead><tr><th style={{ width: 36 }}></th><th>Frais</th><th style={{ width: 100, textAlign: 'right' }}>Montant</th></tr></thead>
              <tbody>
                {fraisCatalogue.map(f => {
                  const checked = fraisIds.has(f.id);
                  return (
                    <tr key={f.id} style={checked ? styles.trChecked : null} onClick={() => toggleFrais(f)}>
                      <td style={styles.td}><input type="checkbox" checked={checked} onChange={() => {}} /></td>
                      <td style={styles.td}>{f.libelle}</td>
                      <td style={{ ...styles.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtEur(f.montant)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      <div style={styles.col}>
        <Section title="Devis en cours">
          <div style={{ marginBottom: 16 }}>
            <div style={styles.subHeader}><span style={styles.subTitle}>Prestations sélectionnées</span><button style={styles.btnGhost} onClick={addLigneLibrePrestation}><Plus size={14} /></button></div>
            {devis.lignesPrestations.length === 0 ? (
              <div style={styles.empty}>Sélectionnez à gauche</div>
            ) : (
              <table style={styles.table}>
                <thead><tr><th>Prestation</th><th style={{ width: 110, textAlign: 'right' }}>Honoraires</th><th style={{ width: 100, textAlign: 'right' }}>Frais</th><th style={{ width: 32 }}></th></tr></thead>
                <tbody>
                  {devis.lignesPrestations.map(l => (
                    <tr key={l.id}>
                      <td style={styles.td}><input style={styles.inputBare} value={l.libelle} onChange={e => updateLignePrestation(l.id, 'libelle', e.target.value)} /></td>
                      <td style={styles.td}><input style={{ ...styles.inputBare, textAlign: 'right' }} type="number" step="0.01" value={l.honoraires} onChange={e => updateLignePrestation(l.id, 'honoraires', Number(e.target.value))} /></td>
                      <td style={styles.td}><input style={{ ...styles.inputBare, textAlign: 'right' }} type="number" step="0.01" value={l.frais} onChange={e => updateLignePrestation(l.id, 'frais', Number(e.target.value))} /></td>
                      <td style={styles.td}><button style={styles.btnIcon} onClick={() => deleteLignePrestation(l.id)}><Trash2 size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={styles.subHeader}><span style={styles.subTitle}>Frais sélectionnés</span><button style={styles.btnGhost} onClick={addLigneLibreFrais}><Plus size={14} /></button></div>
            {devis.lignesFrais.length === 0 ? (
              <div style={styles.empty}>Aucun</div>
            ) : (
              <table style={styles.table}>
                <thead><tr><th>Frais</th><th style={{ width: 110, textAlign: 'right' }}>Montant</th><th style={{ width: 32 }}></th></tr></thead>
                <tbody>
                  {devis.lignesFrais.map(l => (
                    <tr key={l.id}>
                      <td style={styles.td}><input style={styles.inputBare} value={l.libelle} onChange={e => updateLigneFrais(l.id, 'libelle', e.target.value)} /></td>
                      <td style={styles.td}><input style={{ ...styles.inputBare, textAlign: 'right' }} type="number" step="0.01" value={l.montant} onChange={e => updateLigneFrais(l.id, 'montant', Number(e.target.value))} /></td>
                      <td style={styles.td}><button style={styles.btnIcon} onClick={() => deleteLigneFrais(l.id)}><Trash2 size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={styles.subHeader}><span style={styles.subTitle}>Droits d'enregistrement</span><button style={styles.btnGhost} onClick={() => onOpenCalc()}><Calculator size={14} /></button></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={{ ...styles.input, flex: 1 }} placeholder="Description" value={devis.droitsEnregistrement.detail} onChange={e => setDevis(d => ({ ...d, droitsEnregistrement: { ...d.droitsEnregistrement, detail: e.target.value } }))} />
              <input style={{ ...styles.input, width: 140, textAlign: 'right' }} type="number" step="0.01" value={devis.droitsEnregistrement.montant} onChange={e => setDevis(d => ({ ...d, droitsEnregistrement: { ...d.droitsEnregistrement, montant: Number(e.target.value) } }))} />
            </div>
          </div>
        </Section>

        <Section title="Récapitulatif">
          <div style={styles.recap}>
            <RecapLine label="Honoraires HT" value={totaux.honorairesHT} />
            <RecapLine label={`TVA ${devis.tauxTVA}%`} value={totaux.tvaHonoraires} muted />
            <RecapLine label="Honoraires TTC" value={totaux.honorairesTTC} bold />
            <div style={styles.recapSep}></div>
            <RecapLine label="Frais HT" value={totaux.fraisPrestationsHT + totaux.fraisDiversHT} />
            <RecapLine label={`TVA ${devis.tauxTVA}%`} value={totaux.tvaFrais} muted />
            <RecapLine label="Droits" value={totaux.droits} muted />
            <RecapLine label="Frais TTC" value={totaux.fraisTTC} bold />
            <div style={styles.recapSep}></div>
            <RecapLine label="TOTAL TTC" value={totaux.totalTTC} big />
          </div>
        </Section>

        <div style={styles.actionsBar}>
          <button style={styles.btnSecondary} onClick={resetDevis}><X size={16} /> Nouveau</button>
          <button style={styles.btnSecondary} onClick={saveToHistory}><Save size={16} /> Enregistrer</button>
          <button style={styles.btnPrimary} onClick={() => exportPDF(devis, cabinet, avocats, totaux)}><Download size={16} /> PDF</button>
          <button style={styles.btnPrimary} onClick={() => exportWord(devis, cabinet, avocats, totaux)}><Download size={16} /> Word</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// AUTRES ONGLETS (SIMPLIFIÉ)
// ============================================================================

function DroitsTab({ onApplyToDevis }) {
  const [type, setType] = useState('fonds');
  const [fondsPrix, setFondsPrix] = useState(0);
  const [partsPrix, setPartsPrix] = useState(0);
  const [partsCedees, setPartsCedees] = useState(0);
  const [partsTotal, setPartsTotal] = useState(100);
  const [actionsPrix, setActionsPrix] = useState(0);
  const [immobPrix, setImmobPrix] = useState(0);

  const result = useMemo(() => {
    if (type === 'fonds') {
      const droit = calcCessionFondsCommerce(fondsPrix);
      return { montant: droit, libelle: 'Cession de fonds de commerce — droits d\'enregistrement' };
    }
    if (type === 'parts') {
      const r = calcCessionParts(partsPrix, partsCedees, partsTotal);
      return { montant: r.droit, libelle: 'Cession de parts sociales — droits d\'enregistrement' };
    }
    if (type === 'actions') {
      const droit = calcCessionActions(actionsPrix);
      return { montant: droit, libelle: 'Cession d\'actions — droits d\'enregistrement' };
    }
    if (type === 'immob') {
      const droit = calcCessionImmeubleSocietes(immobPrix);
      return { montant: droit, libelle: 'Cession parts SPI — droits d\'enregistrement' };
    }
    return { montant: 125, libelle: 'Droit fixe d\'enregistrement' };
  }, [type, fondsPrix, partsPrix, partsCedees, partsTotal, actionsPrix, immobPrix]);

  const types = [
    { id: 'fonds', label: 'Cession de fonds de commerce' },
    { id: 'parts', label: 'Cession de parts sociales (SARL)' },
    { id: 'actions', label: 'Cession d\'actions (SAS / SA)' },
    { id: 'immob', label: 'Cession parts SPI' },
    { id: 'fixe', label: 'Droit fixe (125 €)' },
  ];

  return (
    <div style={styles.singleCol}>
      <Section title="Calculateur de droits d'enregistrement">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
          {types.map(t => (
            <button key={t.id} onClick={() => setType(t.id)} style={{ ...styles.pill, ...(type === t.id ? styles.pillActive : {}) }}>{t.label}</button>
          ))}
        </div>

        {type === 'fonds' && <Field label="Prix de cession (€)"><input style={styles.input} type="number" step="0.01" value={fondsPrix} onChange={e => setFondsPrix(e.target.value)} /></Field>}
        {type === 'parts' && (
          <div style={styles.formGrid}>
            <Field label="Prix de cession (€)"><input style={styles.input} type="number" step="0.01" value={partsPrix} onChange={e => setPartsPrix(e.target.value)} /></Field>
            <Field label="Parts cédées"><input style={styles.input} type="number" value={partsCedees} onChange={e => setPartsCedees(e.target.value)} /></Field>
            <Field label="Total parts"><input style={styles.input} type="number" value={partsTotal} onChange={e => setPartsTotal(e.target.value)} /></Field>
            <Field label=" "><div style={styles.hint}>Taux : 3% avec abattement</div></Field>
          </div>
        )}
        {type === 'actions' && <Field label="Prix de cession (€)"><input style={styles.input} type="number" step="0.01" value={actionsPrix} onChange={e => setActionsPrix(e.target.value)} /></Field>}
        {type === 'immob' && <Field label="Prix de cession (€)"><input style={styles.input} type="number" step="0.01" value={immobPrix} onChange={e => setImmobPrix(e.target.value)} /></Field>}

        <div style={styles.resultBox}>
          <div style={styles.resultLabel}>Droits calculés</div>
          <div style={styles.resultValue}>{fmtEur(result.montant)}</div>
        </div>

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button style={styles.btnPrimary} onClick={() => onApplyToDevis(result.montant, result.libelle)}><Check size={16} /> Insérer</button>
        </div>
      </Section>
    </div>
  );
}

function ParametresTab({ cabinet, setCabinet, avocats, setAvocats, prestations, setPrestations, fraisCatalogue, setFraisCatalogue, syncStatus }) {
  const [sub, setSub] = useState('cabinet');
  const [syncMsg, setSyncMsg] = useState('');

  function uploadLogo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCabinet(c => ({ ...c, logo: reader.result }));
    reader.readAsDataURL(file);
  }

  async function updatePrestation(p) {
    const result = await supabaseCall(`prestations?id=eq.${p.id}`, 'PATCH', p);
    if (result !== null) setSyncMsg('✅ Mis à jour');
  }

  async function updateFrais(f) {
    const result = await supabaseCall(`frais_divers?id=eq.${f.id}`, 'PATCH', f);
    if (result !== null) setSyncMsg('✅ Mis à jour');
  }

  async function updateAvocat(a) {
    const result = await supabaseCall(`avocats?id=eq.${a.id}`, 'PATCH', a);
    if (result !== null) setSyncMsg('✅ Avocat mis à jour');
  }

  async function deleteP(id) {
    const result = await supabaseCall(`prestations?id=eq.${id}`, 'DELETE');
    if (result !== null) setPrestations(prestations.filter(p => p.id !== id));
  }

  async function deleteF(id) {
    const result = await supabaseCall(`frais_divers?id=eq.${id}`, 'DELETE');
    if (result !== null) setFraisCatalogue(fraisCatalogue.filter(f => f.id !== id));
  }

  async function deleteA(id) {
    const result = await supabaseCall(`avocats?id=eq.${id}`, 'DELETE');
    if (result !== null) setAvocats(avocats.filter(a => a.id !== id));
  }

  async function addAvocat() {
    const newA = { id: `av_${Date.now()}`, nom: 'Nouvel avocat', titre: '', email: '' };
    const result = await supabaseCall('avocats', 'POST', newA);
    if (result) setAvocats([...avocats, result[0] || newA]);
  }

  const subTabs = [
    { id: 'cabinet', label: 'Cabinet' },
    { id: 'avocats', label: 'Avocats' },
    { id: 'prestations', label: 'Prestations (partagé)' },
    { id: 'frais', label: 'Frais (partagé)' },
  ];

  return (
    <div style={styles.singleCol}>
      <div style={styles.infoBox}>
        {syncStatus === 'ok' && <div>🟢 Connecté. Catalogues synchronisés.</div>}
        {syncStatus === 'error' && <div>⚠️ Erreur de connexion.</div>}
        {syncMsg && <div style={{ marginTop: 8, color: '#059669' }}>{syncMsg}</div>}
      </div>

      <div style={styles.subTabsBar}>
        {subTabs.map(s => (
          <button key={s.id} onClick={() => setSub(s.id)} style={{ ...styles.subTab, ...(sub === s.id ? styles.subTabActive : {}) }}>{s.label}</button>
        ))}
      </div>

      {sub === 'cabinet' && (
        <Section title="Informations du cabinet">
          <div style={styles.formGrid}>
            <Field label="Raison sociale" full><input style={styles.input} value={cabinet.raisonSociale} onChange={e => setCabinet(c => ({ ...c, raisonSociale: e.target.value }))} /></Field>
            <Field label="Adresse" full><textarea style={{ ...styles.input, minHeight: 80 }} value={cabinet.adresse} onChange={e => setCabinet(c => ({ ...c, adresse: e.target.value }))} /></Field>
            <Field label="Téléphone"><input style={styles.input} value={cabinet.telephone} onChange={e => setCabinet(c => ({ ...c, telephone: e.target.value }))} /></Field>
            <Field label="Email"><input style={styles.input} value={cabinet.email} onChange={e => setCabinet(c => ({ ...c, email: e.target.value }))} /></Field>
            <Field label="Logo"><label style={styles.btnSecondary}><Upload size={14} /> Importer<input type="file" accept="image/*" onChange={uploadLogo} style={{ display: 'none' }} /></label>{cabinet.logo && <button style={styles.btnGhost} onClick={() => setCabinet(c => ({ ...c, logo: null }))}><X size={14} /></button>}</Field>
          </div>
        </Section>
      )}

      {sub === 'avocats' && (
        <Section title="Avocats signataires (partagé)" actions={<button style={styles.btnPrimary} onClick={addAvocat}><Plus size={14} /></button>}>
          <table style={styles.table}>
            <thead><tr><th>Nom</th><th>Titre</th><th>Email</th><th style={{ width: 60 }}></th></tr></thead>
            <tbody>
              {avocats.map(a => (
                <tr key={a.id}>
                  <td style={styles.td}><input style={styles.inputBare} value={a.nom} onChange={e => { const u = { ...a, nom: e.target.value }; setAvocats(avocats.map(x => x.id === a.id ? u : x)); updateAvocat(u); }} /></td>
                  <td style={styles.td}><input style={styles.inputBare} value={a.titre || ''} onChange={e => { const u = { ...a, titre: e.target.value }; setAvocats(avocats.map(x => x.id === a.id ? u : x)); updateAvocat(u); }} /></td>
                  <td style={styles.td}><input style={styles.inputBare} value={a.email || ''} onChange={e => { const u = { ...a, email: e.target.value }; setAvocats(avocats.map(x => x.id === a.id ? u : x)); updateAvocat(u); }} /></td>
                  <td style={styles.td}><button style={styles.btnIcon} onClick={() => deleteA(a.id)}><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {sub === 'prestations' && (
        <Section title="Catalogue des prestations (partagé)" actions={<button style={styles.btnPrimary} onClick={() => { const p = { id: `p_${Date.now()}`, categorie: 'Divers', libelle: 'Nouvelle', honoraires: 0, frais: 0 }; setPrestations([p, ...prestations]); }}><Plus size={14} /></button>}>
          <table style={styles.table}>
            <thead><tr><th style={{ width: 140 }}>Catégorie</th><th>Libellé</th><th style={{ width: 120, textAlign: 'right' }}>Honoraires</th><th style={{ width: 100, textAlign: 'right' }}>Frais</th><th style={{ width: 80 }}></th></tr></thead>
            <tbody>
              {prestations.map(p => (
                <tr key={p.id}>
                  <td style={styles.td}><input style={styles.inputBare} value={p.categorie} onChange={e => { const u = { ...p, categorie: e.target.value }; setPrestations(prestations.map(x => x.id === p.id ? u : x)); updatePrestation(u); }} /></td>
                  <td style={styles.td}><input style={styles.inputBare} value={p.libelle} onChange={e => { const u = { ...p, libelle: e.target.value }; setPrestations(prestations.map(x => x.id === p.id ? u : x)); updatePrestation(u); }} /></td>
                  <td style={styles.td}><input style={{ ...styles.inputBare, textAlign: 'right' }} type="number" step="0.01" value={p.honoraires} onChange={e => { const u = { ...p, honoraires: Number(e.target.value) }; setPrestations(prestations.map(x => x.id === p.id ? u : x)); updatePrestation(u); }} /></td>
                  <td style={styles.td}><input style={{ ...styles.inputBare, textAlign: 'right' }} type="number" step="0.01" value={p.frais} onChange={e => { const u = { ...p, frais: Number(e.target.value) }; setPrestations(prestations.map(x => x.id === p.id ? u : x)); updatePrestation(u); }} /></td>
                  <td style={styles.td}><button style={styles.btnIcon} onClick={() => deleteP(p.id)}><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {sub === 'frais' && (
        <Section title="Catalogue des frais (partagé)" actions={<button style={styles.btnPrimary} onClick={() => { const f = { id: `f_${Date.now()}`, libelle: 'Nouveau', montant: 0 }; setFraisCatalogue([f, ...fraisCatalogue]); }}><Plus size={14} /></button>}>
          <table style={styles.table}>
            <thead><tr><th>Libellé</th><th style={{ width: 140, textAlign: 'right' }}>Montant</th><th style={{ width: 80 }}></th></tr></thead>
            <tbody>
              {fraisCatalogue.map(f => (
                <tr key={f.id}>
                  <td style={styles.td}><input style={styles.inputBare} value={f.libelle} onChange={e => { const u = { ...f, libelle: e.target.value }; setFraisCatalogue(fraisCatalogue.map(x => x.id === f.id ? u : x)); updateFrais(u); }} /></td>
                  <td style={styles.td}><input style={{ ...styles.inputBare, textAlign: 'right' }} type="number" step="0.01" value={f.montant} onChange={e => { const u = { ...f, montant: Number(e.target.value) }; setFraisCatalogue(fraisCatalogue.map(x => x.id === f.id ? u : x)); updateFrais(u); }} /></td>
                  <td style={styles.td}><button style={styles.btnIcon} onClick={() => deleteF(f.id)}><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
    </div>
  );
}

function HistoriqueTab({ historique, setHistorique, onOpen }) {
  async function deleteFromDB(id) {
    await supabaseCall(`historique_devis?id=eq.${id}`, 'DELETE');
    setHistorique(historique.filter(h => h.id !== id));
  }

  return (
    <div style={styles.singleCol}>
      <Section title={`Historique (${historique.length} devis partagés)`}>
        {historique.length === 0 ? (
          <div style={styles.empty}>Aucun devis</div>
        ) : (
          <table style={styles.table}>
            <thead><tr><th>Référence</th><th>Date</th><th>Client</th><th>Avocat</th><th style={{ textAlign: 'right' }}>Total TTC</th><th style={{ width: 160 }}></th></tr></thead>
            <tbody>
              {historique.map(h => (
                <tr key={h.id}>
                  <td style={styles.td}><strong>{h.reference}</strong></td>
                  <td style={styles.td}>{h.date}</td>
                  <td style={styles.td}>{h.client_nom || '—'}</td>
                  <td style={styles.td}>{h.avocat_nom}</td>
                  <td style={{ ...styles.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtEur(h.total_ttc)}</td>
                  <td style={styles.td}><button style={styles.btnGhost} onClick={() => onOpen(h)}><Edit2 size={14} /> Ouvrir</button><button style={styles.btnIcon} onClick={() => { if (confirm('Supprimer ?')) deleteFromDB(h.id); }}><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}

// ============================================================================
// COMPOSANTS RÉUTILISABLES
// ============================================================================

function Section({ title, children, actions }) {
  return (
    <section style={styles.section}>
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>{title}</h2>
        {actions}
      </div>
      <div style={styles.sectionBody}>{children}</div>
    </section>
  );
}

function Field({ label, children, full }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : 'auto' }}>
      <label style={styles.label}>{label}</label>
      {children}
    </div>
  );
}

function RecapLine({ label, value, bold, muted, big }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: big ? '10px 0' : '4px 0', fontSize: big ? 18 : 14, fontWeight: big || bold ? 700 : 400, color: muted ? '#6b7280' : (big ? '#0a0a0a' : '#1f2937'), borderTop: big ? '2px solid #C9A84C' : 'none', marginTop: big ? 4 : 0 }}>
      <span>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtEur(value)}</span>
    </div>
  );
}

// ============================================================================
// EXPORT WORD & PDF
// ============================================================================

async function exportWord(devis, cabinet, avocats, totaux) {
  const avocat = avocats.find(a => a.id === devis.avocatId);
  const dateFR = new Date(devis.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const tCell = (text, opts = {}) => new DocxTableCell({
    width: { size: opts.width || 4680, type: WidthType.DXA },
    shading: opts.bg ? { fill: opts.bg, type: ShadingType.CLEAR } : undefined,
    borders: { top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" }, bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" }, left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" }, right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" } },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ alignment: opts.align || AlignmentType.LEFT, children: [new TextRun({ text: String(text), bold: opts.bold, color: opts.color || "1A1A1A", size: opts.size || 20 })] })],
  });
  const children = [
    new Paragraph({ children: [new TextRun({ text: 'LCE', bold: true, size: 48, color: "1A1A1A" })] }),
    new Paragraph({ children: [new TextRun({ text: 'AVOCATS NOTAIRES', bold: true, size: 18, color: "1A1A1A" })] }),
    new Paragraph({ children: [new TextRun({ text: '' })], spacing: { after: 200 } }),
    new Paragraph({ children: [new TextRun({ text: cabinet.raisonSociale, bold: true, size: 18, color: "1A1A1A" })] }),
    ...cabinet.adresse.split('\n').map(line => new Paragraph({ children: [new TextRun({ text: line, size: 18, color: "6B7280" })] })),
    new Paragraph({ children: [new TextRun({ text: `Tél. ${cabinet.telephone} · ${cabinet.email}`, size: 18, color: "6B7280" })], spacing: { after: 400 } }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 100 }, children: [new TextRun({ text: 'DEVIS SUR HONORAIRES ET FRAIS', bold: true, size: 32, color: "1A1A1A" })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 300 }, children: [new TextRun({ text: 'Loi n° 2015-990 du 6 août 2015 — Art. 51', italics: true, size: 16, color: "6B7280" })] }),
    new Paragraph({ children: [new TextRun({ text: `Référence : ${devis.reference}     Date : ${dateFR}`, size: 20 })], spacing: { after: 100 } }),
    ...(devis.client.nom ? [new Paragraph({ children: [new TextRun({ text: `Client : ${devis.client.nom}`, size: 20 })] })] : []),
    ...(devis.client.adresse ? devis.client.adresse.split('\n').map(line => new Paragraph({ children: [new TextRun({ text: line, size: 20 })] })) : []),
    new Paragraph({ children: [new TextRun({ text: '' })], spacing: { after: 200 } }),
  ];
  if (devis.lignesPrestations.length > 0) {
    children.push(new Paragraph({ children: [new TextRun({ text: 'HONORAIRES', bold: true, size: 24, color: "1A1A1A" })], spacing: { before: 200, after: 100 } }));
    children.push(new DocxTable({
      width: { size: 9000, type: WidthType.DXA },
      columnWidths: [6500, 2500],
      rows: [
        new DocxTableRow({ children: [tCell('Prestation', { width: 6500, bold: true, bg: "C9A84C", color: 'FFFFFF' }), tCell('Honoraires HT', { width: 2500, bold: true, bg: "C9A84C", color: 'FFFFFF', align: AlignmentType.RIGHT })] }),
        ...devis.lignesPrestations.map(l => new DocxTableRow({ children: [tCell(l.libelle, { width: 6500 }), tCell(fmtEur(l.honoraires), { width: 2500, align: AlignmentType.RIGHT })] })),
        new DocxTableRow({ children: [tCell('Sous-total HT', { width: 6500, bold: true }), tCell(fmtEur(totaux.honorairesHT), { width: 2500, align: AlignmentType.RIGHT, bold: true })] }),
        new DocxTableRow({ children: [tCell(`TVA ${devis.tauxTVA}%`, { width: 6500 }), tCell(fmtEur(totaux.tvaHonoraires), { width: 2500, align: AlignmentType.RIGHT })] }),
        new DocxTableRow({ children: [tCell('TOTAL TTC', { width: 6500, bold: true, bg: 'F5F5F5' }), tCell(fmtEur(totaux.honorairesTTC), { width: 2500, align: AlignmentType.RIGHT, bold: true, bg: 'F5F5F5' })] }),
      ],
    }));
  }
  children.push(new Paragraph({ children: [new TextRun({ text: 'FRAIS', bold: true, size: 24, color: "1A1A1A" })], spacing: { before: 300, after: 100 } }));
  const fRows = [new DocxTableRow({ children: [tCell('Frais', { width: 6500, bold: true, bg: "C9A84C", color: 'FFFFFF' }), tCell('Montant HT', { width: 2500, bold: true, bg: "C9A84C", color: 'FFFFFF', align: AlignmentType.RIGHT })] })];
  devis.lignesPrestations.filter(l => Number(l.frais) > 0).forEach(l => fRows.push(new DocxTableRow({ children: [tCell(`Frais — ${l.libelle}`, { width: 6500 }), tCell(fmtEur(l.frais), { width: 2500, align: AlignmentType.RIGHT })] })));
  devis.lignesFrais.forEach(l => fRows.push(new DocxTableRow({ children: [tCell(l.libelle, { width: 6500 }), tCell(fmtEur(l.montant), { width: 2500, align: AlignmentType.RIGHT })] })));
  if (Number(devis.droitsEnregistrement.montant) > 0) fRows.push(new DocxTableRow({ children: [tCell(devis.droitsEnregistrement.detail || 'Droits', { width: 6500 }), tCell(fmtEur(devis.droitsEnregistrement.montant) + ' *', { width: 2500, align: AlignmentType.RIGHT })] }));
  fRows.push(new DocxTableRow({ children: [tCell('Sous-total HT', { width: 6500, bold: true }), tCell(fmtEur(totaux.fraisPrestationsHT + totaux.fraisDiversHT), { width: 2500, align: AlignmentType.RIGHT, bold: true })] }));
  fRows.push(new DocxTableRow({ children: [tCell(`TVA ${devis.tauxTVA}%`, { width: 6500 }), tCell(fmtEur(totaux.tvaFrais), { width: 2500, align: AlignmentType.RIGHT })] }));
  fRows.push(new DocxTableRow({ children: [tCell('Droits (sans TVA)', { width: 6500 }), tCell(fmtEur(totaux.droits), { width: 2500, align: AlignmentType.RIGHT })] }));
  fRows.push(new DocxTableRow({ children: [tCell('TOTAL TTC', { width: 6500, bold: true, bg: 'F5F5F5' }), tCell(fmtEur(totaux.fraisTTC), { width: 2500, align: AlignmentType.RIGHT, bold: true, bg: 'F5F5F5' })] }));
  children.push(new DocxTable({ width: { size: 9000, type: WidthType.DXA }, columnWidths: [6500, 2500], rows: fRows }));
  children.push(new Paragraph({ children: [new TextRun({ text: '' })], spacing: { after: 300 } }));
  children.push(new DocxTable({ width: { size: 9000, type: WidthType.DXA }, columnWidths: [6500, 2500], rows: [new DocxTableRow({ children: [tCell('TOTAL GÉNÉRAL TTC', { width: 6500, bold: true, bg: "1A1A1A", color: 'FFFFFF', size: 24 }), tCell(fmtEur(totaux.totalTTC), { width: 2500, align: AlignmentType.RIGHT, bold: true, bg: "1A1A1A", color: 'FFFFFF', size: 24 })] })] }));
  if (avocat) {
    children.push(new Paragraph({ children: [new TextRun({ text: '' })], spacing: { after: 400 } }));
    children.push(new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: avocat.nom, bold: true, size: 22 })] }));
    if (avocat.titre) children.push(new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: avocat.titre, size: 18, color: "6B7280" })] }));
  }
  const doc = new Document({ styles: { default: { document: { run: { font: 'Calibri', size: 20 } } } }, sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } } }, children }] });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${devis.reference}.docx`);
}

function exportPDF(devis, cabinet, avocats, totaux) {
  const avocat = avocats.find(a => a.id === devis.avocatId);
  const dateFR = new Date(devis.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const win = window.open('', '_blank');
  if (!win) return alert('Pop-ups requis');
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${devis.reference}</title><style>@page{size:A4;margin:18mm 15mm}*{box-sizing:border-box}body{font-family:'Helvetica Neue',Arial;color:#1a1a1a;font-size:11pt;margin:0;line-height:1.45}.head{display:flex;justify-content:space-between;margin-bottom:30px;padding-bottom:18px;border-bottom:3px solid #C9A84C}.head .logo{font-size:32pt;font-weight:700;letter-spacing:2px}.head .info{text-align:right;font-size:9pt;color:#6b7280}h1{text-align:center;font-size:18pt;margin:30px 0 4px;font-weight:700}table{width:100%;border-collapse:collapse;font-size:10pt}th{background:#C9A84C;color:white;text-align:left;padding:8px 10px;font-weight:700}td{padding:7px 10px;border-bottom:1px solid #e5e7eb}td.r{text-align:right}tr.total td{font-weight:700;background:#1a1a1a;color:white;padding:11px 10px}</style></head><body><div class="head"><div class="logo">LCE<br><span style="font-size:9pt;letter-spacing:4px">AVOCATS NOTAIRES</span></div><div class="info"><strong>${cabinet.raisonSociale}</strong><br>${cabinet.adresse.replace(/\n/g,'<br>')}<br>Tél. ${cabinet.telephone}</div></div><h1>DEVIS SUR HONORAIRES ET FRAIS</h1><p style="text-align:center;font-style:italic;font-size:8pt;color:#6b7280">Loi n° 2015-990 du 6 août 2015 — Art. 51</p><p><strong>Référence :</strong> ${devis.reference} <strong>Date :</strong> ${dateFR}</p>${devis.client.nom?`<p><strong>Client :</strong> ${devis.client.nom}</p>`:''}${devis.lignesPrestations.length>0?`<h2>HONORAIRES</h2><table><thead><tr><th>Prestation</th><th class="r">Honoraires HT</th></tr></thead><tbody>${devis.lignesPrestations.map(l=>`<tr><td>${l.libelle}</td><td class="r">${fmtEur(l.honoraires)}</td></tr>`).join('')}<tr style="font-weight:700"><td>Sous-total HT</td><td class="r">${fmtEur(totaux.honorairesHT)}</td></tr><tr style="color:#6b7280"><td>TVA ${devis.tauxTVA}%</td><td class="r">${fmtEur(totaux.tvaHonoraires)}</td></tr><tr style="font-weight:700"><td>Total TTC</td><td class="r">${fmtEur(totaux.honorairesTTC)}</td></tr></tbody></table>`:''}
<h2>FRAIS</h2><table><thead><tr><th>Frais</th><th class="r">Montant HT</th></tr></thead><tbody>${devis.lignesPrestations.filter(l=>Number(l.frais)>0).map(l=>`<tr><td>Frais — ${l.libelle}</td><td class="r">${fmtEur(l.frais)}</td></tr>`).join('')}${devis.lignesFrais.map(l=>`<tr><td>${l.libelle}</td><td class="r">${fmtEur(l.montant)}</td></tr>`).join('')}${Number(devis.droitsEnregistrement.montant)>0?`<tr><td>${devis.droitsEnregistrement.detail||'Droits'} *</td><td class="r">${fmtEur(devis.droitsEnregistrement.montant)}</td></tr>`:''}<tr style="font-weight:700"><td>Sous-total HT</td><td class="r">${fmtEur(totaux.fraisPrestationsHT+totaux.fraisDiversHT)}</td></tr><tr style="color:#6b7280"><td>TVA ${devis.tauxTVA}%</td><td class="r">${fmtEur(totaux.tvaFrais)}</td></tr><tr style="color:#6b7280"><td>Droits (sans TVA)</td><td class="r">${fmtEur(totaux.droits)}</td></tr><tr style="font-weight:700"><td>Total TTC</td><td class="r">${fmtEur(totaux.fraisTTC)}</td></tr></tbody></table><table style="margin:20px 0"><tbody><tr class="total"><td>TOTAL GÉNÉRAL TTC</td><td class="r">${fmtEur(totaux.totalTTC)}</td></tr></tbody></table><p style="font-style:italic;font-size:8pt;color:#6b7280">* montants estimatifs</p>${avocat?`<p style="margin-top:50px;text-align:right"><strong>${avocat.nom}</strong><br>${avocat.titre||''}</p>`:''}</body></html>`;
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 600);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ============================================================================
// STYLES
// ============================================================================

const styles = {
  app: { minHeight: '100vh', background: '#f5f5f4', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif', color: '#1a1a1a' },
  header: { background: '#fff', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 10 },
  headerInner: { padding: '14px 24px', borderBottom: '3px solid #C9A84C' },
  brand: { display: 'flex', alignItems: 'center', gap: 16 },
  brandLogo: { height: 36 },
  brandText: { lineHeight: 1 },
  brandTitle: { fontSize: 24, fontWeight: 800, letterSpacing: 1, color: '#1a1a1a' },
  brandSubtitle: { fontSize: 8, letterSpacing: 3, color: '#1a1a1a', marginTop: 2 },
  brandSep: { width: 1, height: 24, background: '#d1d5db' },
  brandApp: { fontSize: 14, color: '#6b7280', fontWeight: 500 },
  syncBadge: { fontSize: 11, padding: '4px 8px', background: '#d1fae5', color: '#065f46', borderRadius: 4, fontWeight: 600 },
  nav: { display: 'flex', gap: 4, padding: '0 16px' },
  navBtn: { display: 'flex', alignItems: 'center', gap: 8, padding: '14px 18px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13, color: '#6b7280', fontWeight: 500, borderBottom: '2px solid transparent' },
  navBtnActive: { color: '#1a1a1a', borderBottomColor: '#C9A84C', fontWeight: 600 },
  main: { padding: 24, maxWidth: 1500, margin: '0 auto' },
  grid2col: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 },
  col: { display: 'flex', flexDirection: 'column', gap: 16 },
  singleCol: { maxWidth: 1000, margin: '0 auto' },
  section: { background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'hidden' },
  sectionHeader: { padding: '14px 18px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafafa' },
  sectionTitle: { margin: 0, fontSize: 14, fontWeight: 700, color: '#1a1a1a' },
  sectionBody: { padding: 18 },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 },
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' },
  input: { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: '#fff', color: '#1a1a1a' },
  inputSm: { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, background: '#fff' },
  inputBare: { width: '100%', padding: '6px 8px', border: '1px solid transparent', borderRadius: 4, fontSize: 13, background: 'transparent' },
  tableWrap: { maxHeight: 320, overflow: 'auto', borderRadius: 6, border: '1px solid #e5e7eb' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { padding: '10px 12px', textAlign: 'left', background: '#fafafa', borderBottom: '1px solid #e5e7eb', fontSize: 11, fontWeight: 700, color: '#4b5563', position: 'sticky', top: 0 },
  td: { padding: '8px 12px', borderBottom: '1px solid #f3f4f6' },
  trChecked: { background: '#fefce8' },
  tagCat: { display: 'inline-block', fontSize: 10, padding: '1px 6px', background: '#f3f4f6', color: '#6b7280', borderRadius: 3, marginTop: 2, fontWeight: 500 },
  subHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  subTitle: { fontSize: 12, fontWeight: 700, color: '#4b5563', textTransform: 'uppercase' },
  empty: { padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 13, fontStyle: 'italic', background: '#fafafa', borderRadius: 6, border: '1px dashed #e5e7eb' },
  btnPrimary: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  btnSecondary: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', background: '#fff', color: '#1a1a1a', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  btnGhost: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'transparent', color: '#4b5563', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 500 },
  btnIcon: { padding: 6, background: 'transparent', color: '#9ca3af', border: 'none', borderRadius: 4, cursor: 'pointer' },
  actionsBar: { display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' },
  recap: { padding: '8px 4px' },
  recapSep: { height: 1, background: '#e5e7eb', margin: '8px 0' },
  pill: { padding: '8px 14px', border: '1px solid #d1d5db', background: '#fff', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 500, color: '#4b5563' },
  pillActive: { background: '#1a1a1a', color: '#fff', borderColor: '#1a1a1a', fontWeight: 600 },
  hint: { fontSize: 11, color: '#6b7280', marginTop: 6, fontStyle: 'italic' },
  resultBox: { padding: 20, background: '#fafafa', borderRadius: 8, border: '1px solid #e5e7eb', borderLeft: '3px solid #C9A84C' },
  resultLabel: { fontSize: 11, color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 },
  resultValue: { fontSize: 32, fontWeight: 800, color: '#1a1a1a', marginTop: 4, fontVariantNumeric: 'tabular-nums' },
  subTabsBar: { display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #e5e7eb' },
  subTab: { padding: '10px 16px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13, color: '#6b7280', fontWeight: 500, borderBottom: '2px solid transparent' },
  subTabActive: { color: '#1a1a1a', borderBottomColor: '#C9A84C', fontWeight: 600 },
  infoBox: { padding: 12, background: '#f0fdf4', border: '1px solid #dcfce7', borderRadius: 6, color: '#166534', fontSize: 12, marginBottom: 16 },
};
