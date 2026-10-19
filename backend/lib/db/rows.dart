import 'package:sqlite3/sqlite3.dart';

/// Row helpers.
Map<String, Object?> rowToMap(Row row) => row;

bool asBool(Object? value) => value == 1 || value == true || value == '1';

int nowMs() => DateTime.now().millisecondsSinceEpoch;
