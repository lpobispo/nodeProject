import express from 'express';
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import open from 'open'; // Use `import` instead of `require`

const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const SCOPES = ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/drive.file'];

let oAuth2Client;

async function authorize() {
  const content = fs.readFileSync(CREDENTIALS_PATH);
  const credentials = JSON.parse(content);
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    'http://localhost:3000/oauth2callback'
  );

  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
  } else {
    return getNewToken();
  }
}

function getNewToken() {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  open(authUrl); // Open browser with the OAuth URL
}

const app = express();

app.get('/oauth2callback', (req, res) => {
  const code = req.query.code;
  if (code) {
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return res.status(500).send('Authentication failed');
      oAuth2Client.setCredentials(token);
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
      res.send('Authentication successful! You can close this window.');
    });
  } else {
    res.send('No code received.');
  }
});

const server = app.listen(3000, () => {
  console.log('Server listening on http://localhost:3000');
  authorize();
});




// Step 1: List Current Permissions and Retrieve PermissionId
async function listCurrentPermissions(auth, fileId, newOwnerEmail) {
  const drive = google.drive({ version: 'v3', auth });
  try {
    const res = await drive.permissions.list({
      fileId,
      fields: 'permissions(id, emailAddress, role)',
    });

    console.log('Current permissions:', res.data.permissions);

    // Find the permission ID of the new owner
    const newOwnerPermission = res.data.permissions.find(
      (perm) => perm.emailAddress === newOwnerEmail
    );

    if (newOwnerPermission) {
      console.log(`Found permission ID for ${newOwnerEmail}: ${newOwnerPermission.id}`);
      return newOwnerPermission.id; // Return the permissionId for the new owner
    } else {
      console.error(`No permission found for ${newOwnerEmail}.`);
      return null;
    }
  } catch (error) {
    console.error('Error listing permissions:', error.message);
    return null;
  }
}

// Step 2: Initiate Ownership Transfer using permissionId
async function transferOwnership(auth, fileId, permissionId) {
  const drive = google.drive({ version: 'v3', auth });

  try {
    const permissionResponse = await drive.permissions.update({
      fileId: fileId,
      permissionId: permissionId, // Use the permissionId of the new owner
      requestBody: {
        role: 'writer',
        pendingOwner: true,
      },
    });

    console.log(`Ownership transferred to permission ID: ${permissionId}`);
    console.log('Permission ID:', permissionResponse.data.id);
  } catch (error) {
    console.error('Error transferring ownership:', error.message);
  }
}

async function main() {
  try {
    const auth = await authorize();
    const fileId = '1oENejFOmreYIaahdVHe7LK_Y5c9O6weG'; // Update with your file ID
    const newOwnerEmail = 'email@example.com'; // Update with the new owner's email

    // Step 3: List current permissions and get permissionId
    const permissionId = await listCurrentPermissions(auth, fileId, newOwnerEmail);

    if (permissionId) {
      // Step 4: Transfer ownership using permissionId
      await transferOwnership(auth, fileId, permissionId);
      server.close()
    } else {
      console.error('Ownership transfer aborted due to missing permission ID.');
    }
  } catch (error) {
    console.error(error);
  }
}


main();

// end