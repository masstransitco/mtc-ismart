const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({path:'.env.local'});
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data } = await supabase.from('vehicle_status')
    .select('vin, motion_state, speed, charge_current_a, updated_at')
    .order('updated_at', {ascending: false})
    .limit(5);
  
  console.log('\n=== Most Recently Updated Vehicles ===');
  data.forEach(v => {
    const ago = Math.floor((Date.now() - new Date(v.updated_at)) / 1000);
    console.log('\nVIN:', v.vin);
    console.log('  Motion:', v.motion_state || 'NULL');
    console.log('  Speed:', v.speed, 'km/h');
    console.log('  Current:', v.charge_current_a, 'A');
    console.log('  Updated:', ago, 'seconds ago');
  });
}

check();
