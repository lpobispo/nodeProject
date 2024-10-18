import { google } from 'googleapis';
import express from 'express';
import fs from 'fs';
import path from 'path';
import open from 'open';

const credentialsPath = path.join(process.cwd(), 'credentials.json');
const tokenPath = path.join(process.cwd(), 'token.json');
const credentials = JSON.parse(fs.readFileSync(credentialsPath));
const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]); // Use the first redirect URI
const SCOPES = ['https://www.googleapis.com/auth/drive'];

// Step 1: Get Access Token
function getAccessToken() {
  const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
  console.log('Authorize this app by visiting this url:', authUrl);
  open(authUrl);
}

const app = express();
let server;

// Step 2: OAuth2 Callback Route to handle the authentication
app.get('/oauth2callback', (req, res) => {
  const code = req.query.code;
  if (code) {
    oAuth2Client.getToken(code, (err, token) => {
      if (err) {
        console.error('Error retrieving access token', err);
        return res.status(500).send('Authentication failed.');
      }
      oAuth2Client.setCredentials(token);
      fs.writeFileSync(tokenPath, JSON.stringify(token));
      console.log('Token stored to', tokenPath);
      res.send('Authentication successful! You can close this window.');
      server.close(); // Close the server after authentication
    });
  } else {
    res.send('No code received.');
  }
});

// Step 3: Start the server and initiate the OAuth flow
server = app.listen(3000, () => {
  console.log('Server listening on http://localhost:3000/oauth2callback');
  getAccessToken();
});

// Step 4: Load existing token if available
function loadToken() {
  try {
    const token = JSON.parse(fs.readFileSync(tokenPath));
    oAuth2Client.setCredentials(token);
    console.log('Token loaded successfully.');
  } catch (err) {
    console.error('Token not found, please authenticate first.');
  }
}

// Step 5: List current permissions and retrieve permissionId
async function listCurrentPermissions(fileId, newOwnerEmail) {
  const drive = google.drive({ version: 'v3', auth: oAuth2Client });
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
  }
}

// Step 6: Initiate Ownership Transfer using permissionId
async function initiateOwnershipTransfer(fileId, permissionId) {
  const drive = google.drive({ version: 'v3', auth: oAuth2Client });
  try {
    const res = await drive.permissions.update({
      fileId,
      permissionId, // Use the permissionId of the new owner
      requestBody: {
        role: 'writer',
        pendingOwner: true, // Set to false because the new owner will immediately become the owner
      },
      // transferOwnership: true, // Transfer ownership immediately
    });

    console.log('Ownership transfer completed successfully:', res.data);
  } catch (error) {
    console.error('Error initiating ownership transfer:', error.message);
  }
}

// Load token and initiate the transfer process
loadToken();
const fileId = '1oENejFOmreYIaahdVHe7LK_Y5c9O6weG'; // Update this with your file ID
const newOwnerEmail = 'leanpatrick1422@gmail.com'; // Update this with the new owner's email

// Step 7: Execute the flow - First list permissions, then initiate ownership transfer
listCurrentPermissions(fileId, newOwnerEmail)
  .then((permissionId) => {
    if (permissionId) {
      return initiateOwnershipTransfer(fileId, permissionId);
    } else {
      console.error('Ownership transfer aborted due to missing permission ID.');
    }
  });
