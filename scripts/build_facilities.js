mkdir -p scripts
cat << 'EOF' > scripts/build_facilities.js
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUTPUT_FILE = path.join(__dirname, '../data/facilities.json');
const DATA_SOURCE_URL = "https://raw.githubusercontent.com/datameet/health-facilities/master/data/esic_facilities.json";

function determineTier(name = '', type = '') {
  const combined = `${name} ${type}`.toLowerCase();
  if (combined.includes('medical college') || combined.includes('pgimsr') || combined.includes('super specialty') || combined.includes('model hospital')) {
    return 'Tertiary';
  }
  if (combined.includes('hospital') || combined.includes('annexe') || combined.includes('chc')) {
    return 'Secondary';
  }
  return 'Primary';
}

const TIER_SERVICES = {
  Tertiary: ["Super Specialty", "ICU", "Dialysis", "Blood Bank", "Emergency 24x7", "OPD", "Pharmacy"],
  Secondary: ["General Medicine", "General Surgery", "Pediatrics", "Emergency 24x7", "OPD", "Pharmacy", "Laboratory"],
  Primary: ["OPD Consultation", "Basic Diagnostics", "Pharmacy / Medicine Dispensation", "Immunization"]
};

const dir = path.dirname(OUTPUT_FILE);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

console.log("Fetching official ESIC facility records...");

https.get(DATA_SOURCE_URL, (res) => {
  if (res.statusCode < 200 || res.statusCode >= 300) {
    console.error(`HTTP Error: Received status code ${res.statusCode}`);
    process.exit(1);
  }

  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  
  res.on('end', () => {
    try {
      const rawBuffer = Buffer.concat(chunks);
      const parsed = JSON.parse(rawBuffer.toString('utf-8'));
      
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("Dataset is empty or invalid array structure.");
      }

      console.log(`Processing and normalizing ${parsed.length} records...`);

      const normalizedData = parsed.map((item, index) => {
        const name = (item.name || '').trim();
        const state = (item.state || '').trim();
        const district = (item.district || item.city || '').trim();
        const tier = determineTier(name, item.facility_type);

        return {
          id: item.code || `ESIC-IN-${String(index + 1).padStart(4, '0')}`,
          name: name,
          tier: tier,
          type: item.facility_type || (tier === 'Primary' ? 'ESI Dispensary' : 'ESIC Hospital'),
          state: state,
          district: district,
          address: item.address ? item.address.trim() : `${name}, ${district}, ${state}`,
          coordinates: {
            lat: parseFloat(item.latitude || item.lat) || 0.0,
            lng: parseFloat(item.longitude || item.lng) || 0.0
          },
          contact: {
            phone: item.phone || item.contact || "1800-11-2526",
            emergency: tier !== 'Primary' ? (item.emergency_phone || "011-23234070") : null
          },
          services: TIER_SERVICES[tier],
          bed_capacity: item.beds ? parseInt(item.beds, 10) : (tier === 'Tertiary' ? 500 : tier === 'Secondary' ? 100 : 0),
          referral_required: tier !== 'Primary'
        };
      });

      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(normalizedData), 'utf-8');
      console.log(`Successfully compiled ${normalizedData.length} facilities to ${OUTPUT_FILE}`);
    } catch (err) {
      console.error("Build Pipeline Failed:", err.message);
      process.exit(1);
    }
  });
}).on('error', (err) => {
  console.error("Network Fetch Failed:", err.message);
  process.exit(1);
});
EOF

node scripts/build_facilities.js
git add scripts/build_facilities.js data/facilities.json
git commit -m "feat(data): scale national ESIC directory via build script"
git push origin main
