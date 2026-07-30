/**
 * Parses free text into structured invoice items & customer name.
 * Example inputs:
 *  - "2 Ferrero Rocher @ Rs. 2450, 1 Janan Perfume @ 4850 for Al-Fatah"
 *  - "3 Silk Chocolates Rs 850 for Imtiaz Super Market"
 *  - "2 Hawas Perfume 14500"
 */
export function parseNaturalBillText(text) {
  if (!text || typeof text !== 'string') return null;

  let cleaned = text.trim();
  let customerName = '';

  // Extract customer name if 'for ...' or 'to ...' is present
  const customerMatch = cleaned.match(/(?:for|to|customer:?)\s+([A-Za-z0-9\s.,'-]+?)(?:$|[\n;])/i);
  if (customerMatch) {
    customerName = customerMatch[1].trim();
    cleaned = cleaned.replace(customerMatch[0], '').trim();
  }

  // Split lines or commas
  const segments = cleaned.split(/[\n,;]+/).filter(s => s.trim().length > 0);
  const items = [];

  for (let seg of segments) {
    let raw = seg.trim();
    // Normalize currency tokens: Rs., Rs, PKR, PKR.
    raw = raw.replace(/(?:rs\.?|pkr\.?|rupees)\s*/gi, '');

    // Regex 1: "2 Ferrero Rocher @ 2450" or "2x Ferrero Rocher @ 2450"
    let m = raw.match(/^(\d+)\s*(?:x|@)?\s*([A-Za-z0-9\s\-_()]+?)\s*(?:@|\$|for)?\s*\$?(\d+(?:\.\d{1,2})?)$/i);
    if (m) {
      items.push({
        description: m[2].trim(),
        quantity: parseInt(m[1], 10),
        unit_price: parseFloat(m[3]),
      });
      continue;
    }

    // Regex 2: "Ferrero Rocher 2 @ 2450" or "Ferrero Rocher 2450 x2"
    m = raw.match(/^([A-Za-z0-9\s\-_()]+?)\s+\$?(\d+(?:\.\d{1,2})?)\s*(?:x|qty)?\s*(\d+)?$/i);
    if (m) {
      items.push({
        description: m[1].trim(),
        quantity: m[3] ? parseInt(m[3], 10) : 1,
        unit_price: parseFloat(m[2]),
      });
      continue;
    }

    // Regex 3: "2 Ferrero Rocher 2450"
    m = raw.match(/^(\d+)\s+([A-Za-z0-9\s\-_()]+?)\s+\$?(\d+(?:\.\d{1,2})?)$/i);
    if (m) {
      items.push({
        description: m[2].trim(),
        quantity: parseInt(m[1], 10),
        unit_price: parseFloat(m[3]),
      });
      continue;
    }

    // Fallback: match any number as price and text as name
    const priceMatch = raw.match(/\$?(\d+(?:\.\d{1,2})?)/);
    if (priceMatch) {
      const price = parseFloat(priceMatch[1]);
      const desc = raw.replace(priceMatch[0], '').replace(/(?:x|@|for|qty)/gi, '').trim();
      if (desc) {
        items.push({
          description: desc,
          quantity: 1,
          unit_price: price,
        });
      }
    }
  }

  return {
    customerName,
    items,
  };
}
