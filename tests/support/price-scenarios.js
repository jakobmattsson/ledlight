'use strict';

const declarations = `commodity SEK
  default
  format 1,000.00 SEK
commodity ZEBRA
  format 1000 ZEBRA
commodity ALPHA
  format 1000 ALPHA
commodity Long_Fund_Name
  format 1000 Long_Fund_Name
commodity UNUSED
  format 1000 UNUSED
account Assets:Funds
account Assets:Cash
account Equity:Opening
account Income:Gains
`;

module.exports = [
  {
    name: 'independent quote currencies with corrections and first-seen currency order',
    source: `${declarations}commodity NOK
  format 1,000.00 NOK

2024-01-01 Purchase
  Assets:Funds  1 ALPHA {10 SEK}
  Assets:Cash  -10 SEK

P 2024-01-02 ALPHA 12 NOK
P 2024-01-02 ALPHA 11 SEK
P 2024-01-02 ALPHA 13 NOK ; corrected
P 2024-01-03 ALPHA 14 NOK
`,
    expected: [
      ['2024-01-01', 'ALPHA', '10', null],
      ['2024-01-02', 'ALPHA', '11', null],
      ['2024-01-02', 'ALPHA', '13', 'corrected', 'NOK'],
      ['2024-01-03', 'ALPHA', '14', null, 'NOK'],
    ],
    text: '2024-01-01 ALPHA       10.00 SEK\n' +
      '2024-01-02 ALPHA       11.00 SEK\n' +
      '2024-01-02 ALPHA       13.00 NOK\n' +
      '2024-01-03 ALPHA       14.00 NOK\n',
  },
  {
    name: 'total acquisition costs retain more than ten decimal places',
    source: `${declarations}
2024-01-01 Purchase
  Assets:Funds  4096 ALPHA {{1 SEK}}
  Assets:Cash  -1 SEK
`,
    expected: [
      ['2024-01-01', 'ALPHA', '0.000244140625', null],
    ],
    text: '2024-01-01 ALPHA    0.000244140625 SEK\n',
  },
  {
    name: 'interleaved commodities and years across included files',
    source: `${declarations}include quotes.ledger

2023-12-29 Opening Zebra
  Assets:Funds  1 ZEBRA {8 SEK}
  Equity:Opening  -8 SEK

2023-12-29 Opening Alpha
  Assets:Funds  1 ALPHA {5 SEK}
  Equity:Opening  -5 SEK
`,
    files: {
      'quotes.ledger': `P 2024-02-01 ZEBRA 12.345 SEK
P 2024-01-01 ALPHA 7 SEK
P 2023-12-31 ZEBRA 9 SEK
P 2024-01-01 ZEBRA 11 SEK
P 2023-12-31 ALPHA 6 SEK
P 2023-01-01 UNUSED 999 SEK
`,
    },
    expected: [
      ['2023-12-29', 'ALPHA', '5', null],
      ['2023-12-29', 'ZEBRA', '8', null],
      ['2023-12-31', 'ALPHA', '6', null],
      ['2023-12-31', 'ZEBRA', '9', null],
      ['2024-01-01', 'ALPHA', '7', null],
      ['2024-01-01', 'ZEBRA', '11', null],
      ['2024-02-01', 'ZEBRA', '12.345', null],
    ],
    text: '2023-12-29 ALPHA        5.00 SEK\n' +
      '2023-12-29 ZEBRA        8.00 SEK\n' +
      '2023-12-31 ALPHA        6.00 SEK\n' +
      '2023-12-31 ZEBRA        9.00 SEK\n' +
      '2024-01-01 ALPHA        7.00 SEK\n' +
      '2024-01-01 ZEBRA       11.00 SEK\n' +
      '2024-02-01 ZEBRA      12.345 SEK\n',
  },
  {
    name: 'explicit corrections, inferred unit and total costs, and long names',
    source: `${declarations}P 2024-01-04 ZEBRA 12 SEK
P 2024-01-04 ZEBRA 13 SEK ; corrected
P 2024-01-03 Long_Fund_Name 12345.6789 SEK

2024-01-04 Later inferred price
  Assets:Funds  2 ZEBRA {{20 SEK}}
  Assets:Cash  -20 SEK

2024-01-02 Earlier purchase
  Assets:Funds  2 ALPHA {{15 SEK}}
  Assets:Cash  -15 SEK

2024-01-05 Sale at a total price
  Assets:Funds  -1 ZEBRA {10 SEK} @@ 14 SEK
  Assets:Cash  14 SEK
  Income:Gains  -4 SEK

2024-01-01 Long name purchase
  Assets:Funds  1 Long_Fund_Name {1000 SEK}
  Assets:Cash  -1000 SEK

2024-01-02 Repeated inferred price
  Assets:Funds  1 ALPHA {8 SEK}
  Assets:Cash  -8 SEK

P 2024-01-01 Long_Fund_Name 1001 SEK ; official
`,
    expected: [
      ['2024-01-01', 'Long_Fund_Name', '1001', 'official'],
      ['2024-01-02', 'ALPHA', '8', null],
      ['2024-01-03', 'Long_Fund_Name', '12345.6789', null],
      ['2024-01-04', 'ZEBRA', '10', null],
      ['2024-01-05', 'ZEBRA', '14', null],
    ],
    text: '2024-01-01 Long_Fund_Name 1,001.00 SEK\n' +
      '2024-01-02 ALPHA        8.00 SEK\n' +
      '2024-01-03 Long_Fund_Name 12,345.6789 SEK\n' +
      '2024-01-04 ZEBRA       10.00 SEK\n' +
      '2024-01-05 ZEBRA       14.00 SEK\n',
  },
  {
    name: 'prices for unused commodities produce an empty listing',
    source: `${declarations}P 2024-01-01 UNUSED 100 SEK

2024-01-01 Cash only
  Assets:Cash  100 SEK
  Equity:Opening  -100 SEK
`,
    expected: [],
    text: '',
  },
];
