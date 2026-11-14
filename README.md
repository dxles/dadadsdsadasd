# Çınla

Türkçe müzik listeleri ve şarkı sözleri için kurulabilir web uygulaması.

## Çalıştırma

Dosyaları bir web sunucusuna yükleyin ve siteyi HTTPS üzerinden açın. Servis çalışanı ve uygulama yükleme seçeneği, güvenli bağlamda (HTTPS veya localhost) çalışır. `index.html` dosyasını doğrudan dosya yöneticisinden açmak uygulama kurulumunu etkinleştirmez.

Geliştirme sırasında proje klasöründe `python -m http.server 8000` çalıştırıp `http://localhost:8000` adresini açabilirsiniz.

## Windows masaüstü uygulaması

Windows kurulum sihirbazı ve taşınabilir EXE için proje klasöründe `npm install` ardından `npm run dist` çalıştırın. Çıktılar `../cinla-windows` klasörüne oluşturulur. Kurulum dosyasını web sürümünde indirme düğmesinin çalışması için `downloads/Cinla-1.0.0-x64.exe` konumuna kopyalayın. EXE şarkı ekranı açıldığında tam ekrana geçer. Uygulama Spotify müziklerini çalmak yerine Spotify listelerini içe aktarır; YouTube müzik kategorisi onaylı videoları oynatır.

## Web uygulaması olarak kurma

Manifest, ikonlar ve servis çalışanı projede mevcut. PWA destekleyen tarayıcıda ana ekrana ekleyebilirsiniz. Web'deki Windows indirme düğmesi `downloads/Cinla-1.0.0-x64.exe` dosyasını indirir; bu dosyayı web sunucusuna ayrıca koyun.

## Spotify yönlendirme adresi

Spotify Developer Dashboard > uygulama > **Settings** > **Redirect URIs** alanına aşağıdaki adresleri ayrı ayrı ekleyip **Save**'e basın. Adresler büyük-küçük harf ve son eğik çizgi dahil birebir eşleşmelidir:

- Web sitesi: `https://dxles.github.io/dadadsdsadasd/index.html`
- Windows masaüstü uygulaması: `http://127.0.0.1:47831/index.html`

Bu adres listede görünmeden yeniden Spotify ile bağlanın. Spotify'da `localhost` yerine `127.0.0.1` loopback adresi kullanılır. Çınla web adresinde ilk URI'yi, masaüstü uygulamasında ikinci URI'yi kullanır.

## Reklam engelleme

Bir web sayfası, tarayıcının başka sitelerdeki reklam isteklerini veya YouTube oynatıcı içindeki reklamları engelleyemez. Arşivde bulunan uBlock filtre dosyaları bir tarayıcı uzantısı motoru olmadan çalışmaz; projeye dâhil edilmiş olmaları bu engellemeyi sağlamaz. Bu nedenle dosyalar etkinleştirilmiş gibi sunulmaz.

## Google ve Spotify hesapları

`integrations-config.js` dosyasına uygulama sahibinin OAuth istemci kimlikleri yazılmalıdır. Google Cloud Console'da YouTube Data API v3 etkinleştirilmiş bir proje ve web OAuth istemcisi oluşturun; sitenin HTTPS adresini yetkili JavaScript kaynağı olarak ekleyin. Spotify Developer Dashboard'da bir uygulama oluşturun ve `location.origin + location.pathname` ile aynı Redirect URI'yi ekleyin. Ön yüze client secret koymayın; Spotify bağlantısı PKCE kullanır.

Google ve Spotify oturum belirteçleri kullanıcının tarayıcısındaki `localStorage` içinde tutulur. Google izni YouTube Data API erişimi içindir; arama, günlük popüler müzik listesi ve hesap kitaplığı için kullanılır. Spotify bağlantısı kullanıcının listelerini ve beğendiklerini okur. Spotify parçaları Spotify'da açılır; Çınla'nın oynatıcısı YouTube müzik kategorisi videolarını çalar.

Günlük ana sayfa seçkisi YouTube Data API'nin Türkiye bölgesi, müzik kategorisi (`videoCategoryId=10`) ve `mostPopular` listesinden gelir. Bu liste kişiye özel YouTube Music öneri akışı veya resmi “En Popüler Şarkılar” grafiğiyle aynı şey değildir. YouTube Data API günlük YouTube Music şarkı grafiğini doğrudan sunmaz. Hesaptan alınan YouTube listeleri ve beğeniler de kategori 10 olmayan videoları göstermeyecek şekilde süzülür.
