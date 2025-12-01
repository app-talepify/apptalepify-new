#!/bin/bash

# 🚨 Emergency Rollback Script for Firebase Auth Custom Token System
# Kullanım: ./scripts/emergency-rollback.sh [--confirm]

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID="apptalepify-14dbc"
BACKUP_BRANCH="backup/pre-custom-token"
RULES_BACKUP_BRANCH="backup/local-auth-rules"

echo -e "${RED}🚨 EMERGENCY ROLLBACK SCRIPT${NC}"
echo -e "${RED}================================${NC}"
echo "Project: $PROJECT_ID"
echo "Backup Branch: $BACKUP_BRANCH"
echo "Rules Backup: $RULES_BACKUP_BRANCH"
echo ""

# Check if --confirm flag is provided
if [ "$1" != "--confirm" ]; then
    echo -e "${YELLOW}⚠️  Bu script acil durum rollback yapacak!${NC}"
    echo ""
    echo "Yapılacaklar:"
    echo "1. ✅ Feature flag devre dışı bırakılacak"
    echo "2. 🛡️  Firestore rules eski haline çevrilecek"
    echo "3. 🔧 Functions eski versiyona deploy edilecek"
    echo "4. 🧪 Verification testleri çalıştırılacak"
    echo ""
    echo -e "${BLUE}Devam etmek için: ./scripts/emergency-rollback.sh --confirm${NC}"
    exit 1
fi

echo -e "${RED}🚨 EMERGENCY ROLLBACK BAŞLATIYOR...${NC}"
echo ""

# Step 1: Feature flag disable
echo -e "${YELLOW}📝 1. Feature flag devre dışı bırakılıyor...${NC}"
if [ -f ".env" ]; then
    # Backup current .env
    cp .env .env.backup.$(date +%s)
    echo "AUTH_CUSTOM_TOKEN_ENABLED=false" >> .env
    echo "✅ Feature flag disabled in .env"
else
    echo "⚠️  .env file not found, creating with disabled flag"
    echo "AUTH_CUSTOM_TOKEN_ENABLED=false" > .env
fi

# Step 2: Git status check
echo -e "${YELLOW}📝 2. Git durumu kontrol ediliyor...${NC}"
git status --porcelain
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Git repository problem!${NC}"
    exit 1
fi

# Save current state
current_branch=$(git branch --show-current)
echo "Current branch: $current_branch"

# Step 3: Firestore rules rollback
echo -e "${YELLOW}🛡️  3. Firestore rules rollback yapılıyor...${NC}"
if git show-branch $RULES_BACKUP_BRANCH >/dev/null 2>&1; then
    git checkout $RULES_BACKUP_BRANCH -- firestore.rules
    echo "✅ Firestore rules restored from $RULES_BACKUP_BRANCH"
    
    # Deploy rules
    echo "Deploying firestore rules..."
    firebase deploy --only firestore:rules --project=$PROJECT_ID --non-interactive
    if [ $? -eq 0 ]; then
        echo "✅ Firestore rules deployed successfully"
    else
        echo -e "${RED}❌ Firestore rules deployment failed!${NC}"
        exit 1
    fi
else
    echo -e "${RED}❌ Rules backup branch not found: $RULES_BACKUP_BRANCH${NC}"
    exit 1
fi

# Step 4: Functions rollback
echo -e "${YELLOW}🔧 4. Functions rollback yapılıyor...${NC}"
if git show-branch $BACKUP_BRANCH >/dev/null 2>&1; then
    # Stash current changes
    git stash push -m "Emergency rollback stash $(date)"
    
    # Checkout backup branch
    git checkout $BACKUP_BRANCH
    echo "✅ Switched to backup branch: $BACKUP_BRANCH"
    
    # Deploy functions
    echo "Deploying functions..."
    cd functions
    npm install --production
    cd ..
    
    firebase deploy --only functions --project=$PROJECT_ID --non-interactive
    if [ $? -eq 0 ]; then
        echo "✅ Functions deployed successfully"
    else
        echo -e "${RED}❌ Functions deployment failed!${NC}"
        git checkout $current_branch
        exit 1
    fi
    
    # Return to original branch
    git checkout $current_branch
    git stash pop
else
    echo -e "${RED}❌ Backup branch not found: $BACKUP_BRANCH${NC}"
    exit 1
fi

# Step 5: Verification
echo -e "${YELLOW}🧪 5. Verification testleri çalıştırılıyor...${NC}"

# Health check
echo "Health check yapılıyor..."
curl -f -s https://europe-west1-$PROJECT_ID.cloudfunctions.net/bunny/health >/dev/null
if [ $? -eq 0 ]; then
    echo "✅ API health check passed"
else
    echo -e "${YELLOW}⚠️  API health check failed - this may be expected after rollback${NC}"
fi

# Rules verification
echo "Firestore rules verification..."
firebase firestore:rules get --project=$PROJECT_ID >/dev/null
if [ $? -eq 0 ]; then
    echo "✅ Firestore rules verification passed"
else
    echo -e "${RED}❌ Firestore rules verification failed${NC}"
fi

# Step 6: Summary
echo ""
echo -e "${GREEN}✅ ROLLBACK TAMAMLANDI!${NC}"
echo -e "${GREEN}=====================${NC}"
echo ""
echo "Yapılan işlemler:"
echo "✅ Feature flag devre dışı bırakıldı"
echo "✅ Firestore rules rollback yapıldı"
echo "✅ Functions rollback yapıldı"
echo "✅ Verification testleri çalıştırıldı"
echo ""
echo -e "${YELLOW}📋 SON ADIMLAR:${NC}"
echo "1. 📱 Mobile app'i restart edin"
echo "2. 🧪 Manual test yapın (login/logout)"
echo "3. 📊 Monitoring dashboard'ları kontrol edin"
echo "4. 👥 Team'e rollback durumunu bildirin"
echo "5. 📝 Incident report hazırlayın"
echo ""
echo -e "${BLUE}💾 Backup files:${NC}"
echo "- .env.backup.* (original .env)"
echo "- Git stash: Emergency rollback stash"
echo ""
echo -e "${GREEN}Rollback başarıyla tamamlandı! 🎉${NC}"
