// Stub de test pour le paquet `server-only`.
//
// Next.js resout `server-only` en interne (il n'est pas installe dans
// node_modules), donc vitest ne sait pas le charger. Ce stub vide permet de
// tester les modules qui portent ce garde-fou sans le retirer du code de
// production : il empeche un module utilisant la cle service role d'etre
// importe par erreur depuis un composant client.
export {};
