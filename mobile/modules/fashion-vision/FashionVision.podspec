Pod::Spec.new do |s|
  s.name = 'FashionVision'
  s.version = '0.1.0'
  s.summary = 'On-device photo quality and human pose checks for Fashion Centre.'
  s.description = s.summary
  s.license = { :type => 'Proprietary' }
  s.author = 'Fashion Centre'
  s.homepage = 'https://expo.dev'
  # Local Expo module: autolinking supplies the source directory, not a remote pod.
  s.source = { :path => '.' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Vision', 'CoreGraphics', 'ImageIO'
  s.source_files = 'ios/**/*.{h,m,mm,swift}'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
