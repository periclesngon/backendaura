# How to Add Authorized Domain in Firebase Console

## Step-by-Step Instructions

### Current Location
You are currently on: **Project settings** → **General** tab

### Steps to Add Authorized Domain

1. **Click "Authentication" in the Left Sidebar**
   - Look for the icon with two people 👥
   - It's under "Project shortcuts" section
   - Click on it

2. **Go to "Settings" Tab**
   - Once in Authentication, you'll see tabs at the top
   - Click on the **"Settings"** tab (usually the rightmost tab)

3. **Scroll to "Authorized domains" Section**
   - Scroll down on the Settings page
   - You'll see a section called **"Authorized domains"**
   - This section lists domains that can use Firebase Authentication

4. **Click "Add domain" Button**
   - In the "Authorized domains" section, click the **"Add domain"** button

5. **Enter Your Vercel Domain**
   - A dialog will appear
   - Enter your Vercel domain (e.g., `your-app.vercel.app`)
   - **Important:** Don't include `https://` - just the domain name
   - Click **"Add"**

6. **Verify Domain is Added**
   - Your domain should now appear in the list
   - Common domains already listed:
     - `localhost` (for local development)
     - `tcftef-68b4c.firebaseapp.com` (Firebase default)
     - `tcftef-68b4c.web.app` (Firebase default)

### What Domain to Add?

**If you know your Vercel URL:**
- Add: `your-app-name.vercel.app`
- Or: `your-custom-domain.com` (if you have one)

**If you don't know your Vercel URL:**
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Find your project
3. Copy the production URL (e.g., `https://french-learning-platform-ngonpericles-educms-projects.vercel.app`)
4. Remove `https://` and add just the domain part

### Example
If your Vercel URL is:
```
https://french-learning-platform-ngonpericles-educms-projects.vercel.app
```

Add this domain:
```
french-learning-platform-ngonpericles-educms-projects.vercel.app
```

### Quick Navigation Path
```
Firebase Console
  → Authentication (left sidebar) 👥
    → Settings tab
      → Scroll to "Authorized domains"
        → Click "Add domain"
          → Enter domain name
            → Click "Add"
```

### Notes
- You can add multiple domains
- Changes take effect immediately
- No need to redeploy after adding domains
- Local development (`localhost`) is already included by default

