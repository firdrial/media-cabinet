Pod::Spec.new do |s|
  s.name           = 'QuadDetect'
  s.version        = '1.0.0'
  s.summary        = 'Native quad corner detection for VHS Tracker'
  s.description    = 'Vision-based rectangle detection returning four corners.'
  s.author         = 'VHS Tracker'
  s.homepage       = 'https://example.com'
  s.platform       = :ios, '13.4'
  s.source         = { git: '' }
  s.source_files   = '**/*.{h,m,mm,swift}'
  s.dependency 'ExpoModulesCore'
  s.swift_version  = '5.5'
  s.frameworks     = 'Vision'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
end