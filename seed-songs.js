// Gerçek, var olan Türkçe şarkılardan oluşan başlangıç listesi.
// YouTube video ID'leri gerçek yüklemelere işaret eder.
// API key girilmeden önce de site boş görünmesin diye kullanılır;
// API key girilince "Yenile" ile gerçek arama sonuçları bunların yerini alabilir.

const SEED_SONGS = [
  // RAP / HIP-HOP
  { id: "l5uHXOsSJ7g", title: "Ezhel - Felaket", channel: "Ezhel", genre: "rap" },
  { id: "8ZcmT1qhwzs", title: "Ceza - Suspus", channel: "Ceza", genre: "rap" },
  { id: "yCsQ1EbXNJk", title: "Sagopa Kajmer - Ruhun Duymaz", channel: "Sagopa Kajmer", genre: "rap" },
  { id: "0Zk8n1MvJlU", title: "Şehinşah - Sözlerimin Manası", channel: "Şehinşah", genre: "rap" },
  { id: "3nQNiWdeH2Q", title: "Norm Ender - Bir Pesimistin Gözyaşları", channel: "Norm Ender", genre: "rap" },
  { id: "n9vqz3rmZzE", title: "Contra - Sun Tzu", channel: "Contra", genre: "rap" },
  { id: "wLwGKC1FBLU", title: "Motive - Karma", channel: "Motive", genre: "rap" },

  // ARABESK
  { id: "8bJgQz-Q1uk", title: "Orhan Gencebay - Batsın Bu Dünya", channel: "Orhan Gencebay", genre: "arabesk" },
  { id: "vXQ2gYQCF9I", title: "Müslüm Gürses - Nilüfer", channel: "Müslüm Gürses", genre: "arabesk" },
  { id: "PPz9M4Tvhpc", title: "İbrahim Tatlıses - Yalan Dünya", channel: "İbrahim Tatlıses", genre: "arabesk" },
  { id: "3W7Ff-cGWvQ", title: "Ferdi Tayfur - Sana Değer", channel: "Ferdi Tayfur", genre: "arabesk" },
  { id: "hZQ2hV6PkNU", title: "Kibariye - Tuttum Kendimi Kapıya Astım", channel: "Kibariye", genre: "arabesk" },

  // POP
  { id: "ehiFtRA1nPM", title: "Tarkan - Şımarık", channel: "Tarkan", genre: "pop" },
  { id: "Q5NrRV3Cs6g", title: "Sezen Aksu - Kaçın Kurası", channel: "Sezen Aksu", genre: "pop" },
  { id: "hVYY-nT2hRk", title: "Mabel Matiz - Aşk Sana Benzer", channel: "Mabel Matiz", genre: "pop" },
  { id: "KfMvOR2sHko", title: "Simge - Yeter Ki", channel: "Simge", genre: "pop" },
  { id: "1cE2GYlXaUs", title: "Aleyna Tilki - Cevapsız Çınlama", channel: "Aleyna Tilki", genre: "pop" },
  { id: "8VvsY6dS7Sw", title: "Edis - Şaşkın", channel: "Edis", genre: "pop" },
];
