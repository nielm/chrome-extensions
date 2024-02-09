To update the standalone-jsoneditor.* files:

cd ..
npm install
cd window_manager
echo "// @ts-nocheck" > jsoneditor/standalone.js
cat ../node_modules/vanilla-jsoneditor/standalone.js >> jsoneditor/standalone.js
cp ../node_modules/vanilla-jsoneditor/standalone.d.ts jsoneditor/
