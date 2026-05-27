# Mettre à jour GitHub et Vercel

L'application a été mise à jour pour intégrer Supabase. Voici comment redéployer :

## 1. Pousser les changements sur GitHub

Dans le Terminal, depuis le dossier `lce-devis` :

```bash
git add .
git commit -m "Intégration Supabase - catalogue et historique mutualisés"
git push
```

## 2. Vercel redéploie automatiquement

Une fois le `push` effectué, Vercel détecte automatiquement les changements et redéploie l'app. Tu recevras une notification ou tu peux vérifier sur https://vercel.com.

Ça prend **1-2 minutes**. Ensuite, accède à `https://lce-devis-xxx.vercel.app` et tu veras la nouvelle version avec :
- 🟢 Indicateur de synchronisation Supabase
- Catalogue et historique partagés entre tous les utilisateurs
- Les paramètres locaux (cabinet, avocats) restent personnels

## 3. Vérifier que tout marche

- Teste un devis complet
- Enregistre-le (il apparaît dans l'onglet Historique et se synchronise)
- Modifie un tarif dans Paramètres → Prestations (apparaît immédiatement pour tout le cabinet)

Voilà !
