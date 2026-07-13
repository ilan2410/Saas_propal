#!/usr/bin/env bash
# Scanner de sécurité automatique — détecte des PISTES à vérifier manuellement.
# Usage : ./scan.sh <chemin_du_projet>
# Sortie : /tmp/scan_results.txt
# Les résultats sont des indices, PAS des verdicts : vérifier chaque hit en contexte.

set -uo pipefail
ROOT="${1:-.}"
OUT="/tmp/scan_results.txt"
: > "$OUT"

# Répertoires à ignorer
EXCL="--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=build --exclude-dir=.next --exclude-dir=vendor --exclude-dir=.venv"

section() { echo -e "\n===== $1 =====" >> "$OUT"; }
scan() {  # scan "titre" "regex"
  section "$1"
  grep -rInE "$2" "$ROOT" $EXCL 2>/dev/null | head -n 60 >> "$OUT" || true
}

echo "Scan de : $ROOT — $(date)" >> "$OUT"

section "STACK DÉTECTÉ"
for f in package.json composer.json docker-compose.yml Dockerfile next.config.js next.config.mjs .env .env.local; do
  [ -e "$ROOT/$f" ] && echo "présent : $f" >> "$OUT"
done

# --- 🔴 SECRETS ---
scan "SECRETS — clés Stripe live" 'sk_live_[A-Za-z0-9]+'
scan "SECRETS — clés API génériques en dur" '(api[_-]?key|apikey|secret|token|password|passwd)[[:space:]]*[:=][[:space:]]*["'\''][A-Za-z0-9_\-]{16,}'
scan "SECRETS — Supabase service_role" 'service_role|SERVICE_ROLE_KEY'
scan "SECRETS — tokens GitHub" 'ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}'
scan "SECRETS — clés privées" 'BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY'
scan "SECRETS — identifiants SMTP/DB dans URL" '(smtp|postgres|postgresql|mysql|mongodb)://[^[:space:]"'\'']*:[^[:space:]"'\'']*@'
scan "SECRETS — variables PUBLIC contenant secret/key/token" '(NEXT_PUBLIC_|VITE_|REACT_APP_)[A-Z_]*(SECRET|SERVICE_ROLE|PRIVATE|PASSWORD|TOKEN)'

# --- 🔴 RCE / injections ---
scan "RCE — eval / new Function" '\beval\(|new Function\('
scan "RCE — exec / system / shell" '\b(exec|execSync|spawn|system|shell_exec|passthru|popen)\('
scan "RCE — child_process" "child_process"
scan "INJECTION SQL — concaténation dans requête" '(query|execute|raw)\([^)]*(\$\{|["'\''][[:space:]]*\+)'
scan "PATH TRAVERSAL — lecture fichier avec variable" '(readFile|readFileSync|createReadStream|require|include|fopen)\([^)]*(req\.|params|query|body|\$_)'

# --- 🟠 XSS ---
scan "XSS — innerHTML / dangerouslySetInnerHTML / v-html" 'dangerouslySetInnerHTML|\.innerHTML|v-html|insertAdjacentHTML|document\.write'

# --- 🟠 CORS ---
scan "CORS — origine wildcard" 'Access-Control-Allow-Origin["ّ'\''[:space:]]*[:=][[:space:]]*["'\'']\*|origin:[[:space:]]*["'\'']\*|cors\(\)'

# --- 🟠 Randomness / auth ---
scan "RANDOM — Math.random pour token/secret" 'Math\.random\(\)'
scan "JWT — algorithme none / secret faible" 'algorithm[[:space:]]*:[[:space:]]*["'\'']none|jwt.*secret.*["'\''](secret|changeme|test|123)'

# --- 🟡 Debug / IA ---
scan "DEBUG — routes de test/debug/dev" '/(test|debug|dev|__test|_debug)([/"'\'']|$)'
scan "IA — TODO / FIXME / HACK sécurité" '(TODO|FIXME|HACK|XXX).*(secur|auth|password|token|fixme|temp|hack)'
scan "DATA — select all (sur-exposition potentielle)" "select\(['\"]\\*['\"]\\)|SELECT \\* FROM"

# --- 🟡 Docker ---
if [ -f "$ROOT/docker-compose.yml" ]; then
  section "DOCKER — ports exposés publiquement (0.0.0.0 ou ports DB)"
  grep -InE '0\.0\.0\.0:|"(5432|3306|6379|27017|9000|8000):' "$ROOT/docker-compose.yml" >> "$OUT" || true
  section "DOCKER — socket docker monté"
  grep -In 'docker.sock' "$ROOT/docker-compose.yml" >> "$OUT" || true
  section "DOCKER — conteneur en root (absence de user:)"
  grep -In 'privileged:[[:space:]]*true' "$ROOT/docker-compose.yml" >> "$OUT" || true
fi

# --- .env dans git ? ---
section "GIT — .env potentiellement suivi"
if [ -d "$ROOT/.git" ]; then
  ( cd "$ROOT" && git ls-files 2>/dev/null | grep -E '^\.env($|\.)' ) >> "$OUT" || true
  grep -qE '^\.env' "$ROOT/.gitignore" 2>/dev/null && echo ".gitignore couvre .env : OK" >> "$OUT" || echo "ATTENTION : .env absent de .gitignore" >> "$OUT"
fi

# --- Dépendances ---
section "DÉPENDANCES — audit"
if [ -f "$ROOT/package.json" ]; then
  ( cd "$ROOT" && npm audit --production 2>/dev/null | tail -n 20 ) >> "$OUT" || echo "npm audit non exécutable (pas de lockfile ?)" >> "$OUT"
fi

echo -e "\n===== FIN DU SCAN =====" >> "$OUT"
echo "Résultats écrits dans $OUT"
cat "$OUT"
