// The world's 195 sovereign states: the 193 UN members plus the two UN observer states (Vatican City, Palestine).
// The denominator for "% of countries visited". The app's country list also has territories (Hong Kong,
// Greenland, Gibraltar, Antarctica…); visiting those shows on the globe and in the list but not in this %.
// Every code here is in the API's seeded country table (V3__seed_countries.sql).
export const SOVEREIGN_STATES: ReadonlySet<string> = new Set(
  (
    'AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA ' +
    'CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE ' +
    'DE GH GR GD GT GN GW GY HT HN HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KW KG LA LV LB LS LR ' +
    'LY LI LT LU MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG KP MK ' +
    'NO OM PK PW PA PG PY PE PH PL PT QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA ' +
    'KR SS ES LK SD SR SE CH SY TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VE VN YE ZM ' +
    'ZW ' +
    // UN observer states
    'VA PS'
  ).split(' '),
);
