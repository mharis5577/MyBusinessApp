# -------------------------------------------------------------
# FIREBASE CLOUD BACKUP VAULT — PRODUCTION CONFIGURATION
# -------------------------------------------------------------

Firebase Console Direct Link:
https://console.firebase.google.com/project/my-business-8aadb/settings/general/web:YjEwNDJkMTctYmE3Zi00MDVhLTliZWQtMWIwZmZjYWQ1ZTYy

Project Details:
- Project Name: My-Business
- Project ID: my-business-8aadb
- Database Type: Cloud Firestore Database (default)
- Database Region: Singapore (asia-southeast1)

Production API Credentials (Built-in as Default):
-------------------------------------------------
apiKey: "AIzaSyB1jcDCpb0FLy4mHePNLutnlGDBFyAUfIA"
authDomain: "my-business-8aadb.firebaseapp.com"
databaseURL: "https://my-business-8aadb-default-rtdb.asia-southeast1.firebasedatabase.app"
projectId: "my-business-8aadb"
storageBucket: "my-business-8aadb.firebasestorage.app"
messagingSenderId: "1035521814001"
appId: "1:1035521814001:web:a13c2e6888bbe97c88a850"
measurementId: "G-XLK87ECCMC"

Vault Architecture & Usage Notes:
----------------------------------
1. Default Vault ID:
   - Defaults to Company Phone (e.g. 03337669709 or 923337669709).
2. Default Security PIN:
   - Automatically pre-fills with your Staff App PIN (e.g. 1234).
3. Code Location:
   - Configured in `frontend/src/utils/firebaseSync.js` (`DEFAULT_FIREBASE_CONFIG`).
   - UI Panel embedded in `frontend/src/components/FirebaseCloudSyncPanel.jsx`.
4. Updating App:
   - These credentials are hardcoded into the source code as default presets. When you update or reinstall the app, Firebase Cloud Vault is active by default right out of the box!
