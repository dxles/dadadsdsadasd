# Çınla

Türkçe müzik listeleri ve şarkı sözleri için kurulabilir web uygulaması.

## Çalıştırma

Dosyaları bir web sunucusuna yükleyin ve siteyi HTTPS üzerinden açın. Servis çalışanı ve uygulama yükleme seçeneği, güvenli bağlamda (HTTPS veya localhost) çalışır. `index.html` dosyasını doğrudan dosya yöneticisinden açmak uygulama kurulumunu etkinleştirmez.

Geliştirme sırasında proje klasöründe `python -m http.server 8000` çalıştırıp `http://localhost:8000` adresini açabilirsiniz.

## Uygulama olarak kurma

Manifest, ikonlar ve servis çalışanı projede mevcut. Destekleyen tarayıcıda **Uygulamayı yükle** düğmesini kullanın; iPhone ve iPad'de Paylaş menüsünden **Ana Ekrana Ekle** seçeneğini kullanın. Bu yöntem kurulabilir bir PWA oluşturur. Mağazalarda dağıtılan Android/iOS uygulaması istenirse ayrıca yerel bir uygulama kabuğu ve mağaza yapılandırması gerekir.

## Reklam engelleme

Bir web sayfası, tarayıcının başka sitelerdeki reklam isteklerini veya YouTube oynatıcı içindeki reklamları engelleyemez. Arşivde bulunan uBlock filtre dosyaları bir tarayıcı uzantısı motoru olmadan çalışmaz; projeye dâhil edilmiş olmaları bu engellemeyi sağlamaz. Bu nedenle dosyalar etkinleştirilmiş gibi sunulmaz.
